/**
 * Requisitions: a department asks the store for stock. Drafted and submitted by the department
 * (`requisitions.request`), approved — quantities may be cut — or rejected by someone else
 * (`requisitions.approve`), then filled by an ordinary draft issue from the store that points back
 * at it. Posting that issue marks the requisition issued and releases anything held for it.
 *
 * Plain database code.
 */

import { and, asc, desc, eq, inArray, isNull, ne, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/mysql-core';
import { db } from '$lib/server/db';
import {
	branch,
	item,
	location,
	requisition,
	requisitionLine,
	stockBalance,
	stockDocument,
	stockDocumentLine,
	uom,
	user
} from '$lib/server/db/schema';
import { issueNumber, StockError, type Tx } from '$lib/server/stock/post';
import { releaseRequisition, reserveRequisition } from '$lib/server/reservations';
import { m } from '$lib/paraglide/messages.js';
import { round4 } from '$lib/money';
import { orgRowOr404 } from '$lib/server/org';

/** A requisition's status as a word in a sentence, in the viewer's language. */
function stateWord(status: string): string {
	const words: Record<string, () => string> = {
		draft: m.purchasing_req_state_draft,
		submitted: m.purchasing_req_state_submitted,
		approved: m.purchasing_req_state_approved,
		rejected: m.purchasing_req_state_rejected,
		issued: m.purchasing_req_state_issued,
		cancelled: m.purchasing_req_state_cancelled
	};
	return words[status]?.() ?? status;
}

type Reader = Pick<typeof db, 'select'>;

export async function orgRequisition(orgId: number, id: number, reader: Reader = db) {
	return orgRowOr404(requisition, orgId, id, m.purchasing_req_not_found, reader);
}

export async function requisitionLines(orgId: number, requisitionId: number, reader: Reader = db) {
	return reader
		.select({
			id: requisitionLine.id,
			itemId: requisitionLine.itemId,
			item: item.name,
			sku: item.sku,
			uomId: requisitionLine.uomId,
			unit: uom.symbol,
			quantity: requisitionLine.quantity,
			approvedQuantity: requisitionLine.approvedQuantity,
			note: requisitionLine.note
		})
		.from(requisitionLine)
		.innerJoin(item, eq(item.id, requisitionLine.itemId))
		.innerJoin(uom, eq(uom.id, requisitionLine.uomId))
		.where(
			and(
				eq(requisitionLine.orgId, orgId),
				eq(requisitionLine.requisitionId, requisitionId),
				isNull(requisitionLine.deletedAt)
			)
		)
		.orderBy(asc(requisitionLine.id));
}

/** Requisitions, newest first. `branchIds` narrows to the viewer's branches. */
export async function requisitionList(orgId: number, branchIds: number[] | null = null) {
	const asker = alias(user, 'asker');
	const lines = sql<number>`(SELECT COUNT(*) FROM ${requisitionLine}
		WHERE ${requisitionLine.requisitionId} = ${requisition.id} AND ${requisitionLine.deletedAt} IS NULL)`;
	const rows = await db
		.select({
			id: requisition.id,
			number: requisition.number,
			status: requisition.status,
			department: requisition.department,
			requestDate: requisition.requestDate,
			neededBy: requisition.neededBy,
			branchId: requisition.branchId,
			branch: branch.name,
			location: location.name,
			submittedBy: asker.name,
			issueId: requisition.issueId,
			lines
		})
		.from(requisition)
		.innerJoin(branch, eq(branch.id, requisition.branchId))
		.innerJoin(location, eq(location.id, requisition.locationId))
		.leftJoin(asker, eq(asker.id, requisition.submittedBy))
		.where(and(eq(requisition.orgId, orgId), isNull(requisition.deletedAt)))
		.orderBy(desc(requisition.id))
		.limit(1000);
	return rows
		.filter((r) => branchIds === null || branchIds.includes(r.branchId))
		.map((r) => ({ ...r, lines: Number(r.lines) }));
}

/** Departments asked for before, for the form's suggestions. */
export async function departmentNames(orgId: number) {
	const rows = await db
		.selectDistinct({ department: requisition.department })
		.from(requisition)
		.where(eq(requisition.orgId, orgId))
		.orderBy(asc(requisition.department));
	return rows.map((r) => r.department);
}

/** Sends a draft for approval: it gets its number, and its lines stop changing. */
export async function submitRequisition(
	tx: Tx,
	input: { orgId: number; requisitionId: number; userId?: string }
) {
	const req = await orgRequisition(input.orgId, input.requisitionId, tx);
	if (req.status !== 'draft') {
		throw new StockError(m.purchasing_req_already({ status: stateWord(req.status) }));
	}
	const lines = await requisitionLines(input.orgId, req.id, tx);
	if (!lines.length) throw new StockError(m.purchasing_req_add_line_first());
	const number =
		req.number ??
		(await issueNumber(tx, {
			orgId: input.orgId,
			branchId: req.branchId,
			sequence: 'requisition',
			prefix: 'REQ',
			date: req.requestDate
		}));
	await tx
		.update(requisition)
		.set({
			status: 'submitted',
			number,
			submittedAt: new Date(),
			submittedBy: input.userId ?? null
		})
		.where(eq(requisition.id, req.id));
	return number;
}

/**
 * Approves (at the quantities given per line; missing lines are approved in full, 0 refuses a
 * line) or rejects a submitted requisition. Whoever submitted it cannot decide it. Approval holds
 * the stock when the business reserves stock.
 */
export async function decideRequisition(
	tx: Tx,
	input: {
		orgId: number;
		requisitionId: number;
		userId: string;
		approve: boolean;
		quantities?: Map<number, number>;
		note?: string | null;
	}
) {
	const req = await orgRequisition(input.orgId, input.requisitionId, tx);
	if (req.status !== 'submitted') {
		throw new StockError(
			req.status === 'draft'
				? m.purchasing_req_not_submitted()
				: m.purchasing_req_it_is_already({ status: stateWord(req.status) })
		);
	}
	if (req.submittedBy === input.userId) {
		throw new StockError(m.purchasing_req_own());
	}
	if (!input.approve && !input.note?.trim()) {
		throw new StockError(m.purchasing_req_reject_reason());
	}

	if (input.approve) {
		const lines = await requisitionLines(input.orgId, req.id, tx);
		let any = false;
		for (const l of lines) {
			const given = input.quantities?.get(l.id);
			const approved = given === undefined ? l.quantity : given;
			if (!(approved >= 0) || approved > l.quantity) {
				throw new StockError(
					m.purchasing_req_approve_range({ quantity: l.quantity, unit: l.unit, item: l.item })
				);
			}
			if (approved > 0) any = true;
			await tx
				.update(requisitionLine)
				.set({ approvedQuantity: approved })
				.where(eq(requisitionLine.id, l.id));
		}
		if (!any) throw new StockError(m.purchasing_req_nothing_approved());
	}

	await tx
		.update(requisition)
		.set({
			status: input.approve ? 'approved' : 'rejected',
			decidedAt: new Date(),
			decidedBy: input.userId,
			decisionNote: input.note?.trim().slice(0, 255) || null
		})
		.where(eq(requisition.id, req.id));

	if (input.approve) {
		await reserveRequisition(tx, {
			orgId: input.orgId,
			requisitionId: req.id,
			userId: input.userId
		});
	}
}

/**
 * The draft issue that fills an approved requisition: the approved quantities from its store, to
 * the department. The storekeeper checks lots and posts it.
 */
export async function issueFromRequisition(
	tx: Tx,
	input: { orgId: number; requisitionId: number; date: string; userId?: string }
): Promise<number> {
	const req = await orgRequisition(input.orgId, input.requisitionId, tx);
	if (req.status !== 'approved') {
		throw new StockError(
			req.status === 'issued' ? m.purchasing_req_already_issued() : m.purchasing_req_only_approved()
		);
	}
	const [pending] = await tx
		.select({ id: stockDocument.id, status: stockDocument.status, number: stockDocument.number })
		.from(stockDocument)
		.where(
			and(
				eq(stockDocument.requisitionId, req.id),
				eq(stockDocument.orgId, input.orgId),
				ne(stockDocument.status, 'cancelled')
			)
		);
	if (pending) {
		throw new StockError(
			pending.status === 'draft'
				? m.purchasing_req_issue_pending({ id: pending.id })
				: m.purchasing_req_issued_on({ number: pending.number ?? `#${pending.id}` })
		);
	}

	const lines = (await requisitionLines(input.orgId, req.id, tx)).filter(
		(l) => (l.approvedQuantity ?? l.quantity) > 0
	);
	const [loc] = await tx
		.select({ branchId: location.branchId })
		.from(location)
		.where(eq(location.id, req.locationId));
	const [doc] = await tx
		.insert(stockDocument)
		.values({
			orgId: input.orgId,
			type: 'issue',
			branchId: loc.branchId,
			docDate: input.date,
			fromLocationId: req.locationId,
			party: req.department,
			reference: req.number,
			requisitionId: req.id,
			note: req.note,
			createdBy: input.userId
		})
		.$returningId();
	await tx.insert(stockDocumentLine).values(
		lines.map((l) => ({
			orgId: input.orgId,
			documentId: doc.id,
			itemId: l.itemId,
			uomId: l.uomId,
			quantity: l.approvedQuantity ?? l.quantity,
			note: l.note
		}))
	);
	return doc.id;
}

/** Withdraws a requisition that is not yet issued, releasing anything held for it. */
export async function cancelRequisition(
	tx: Tx,
	input: { orgId: number; requisitionId: number; userId?: string }
) {
	const req = await orgRequisition(input.orgId, input.requisitionId, tx);
	if (req.status === 'issued' || req.status === 'cancelled') {
		throw new StockError(m.purchasing_req_already({ status: stateWord(req.status) }));
	}
	await releaseRequisition(tx, req.id);
	await tx
		.update(requisition)
		.set({ status: 'cancelled', updatedBy: input.userId ?? null })
		.where(eq(requisition.id, req.id));
}

/** The requisition's people, store and issue, by name — for its page and printout. */
export async function requisitionDetail(orgId: number, requisitionId: number) {
	const creator = alias(user, 'creator');
	const asker = alias(user, 'asker');
	const decider = alias(user, 'decider');
	const [row] = await db
		.select({
			branch: branch.name,
			branchAddress: branch.address,
			branchPhone: branch.phone,
			location: location.name,
			createdBy: creator.name,
			submittedBy: asker.name,
			decidedBy: decider.name,
			issueNumber: stockDocument.number,
			issueStatus: stockDocument.status,
			issueDate: stockDocument.docDate
		})
		.from(requisition)
		.innerJoin(branch, eq(branch.id, requisition.branchId))
		.innerJoin(location, eq(location.id, requisition.locationId))
		.leftJoin(creator, eq(creator.id, requisition.createdBy))
		.leftJoin(asker, eq(asker.id, requisition.submittedBy))
		.leftJoin(decider, eq(decider.id, requisition.decidedBy))
		.leftJoin(stockDocument, eq(stockDocument.id, requisition.issueId))
		.where(and(eq(requisition.id, requisitionId), eq(requisition.orgId, orgId)));
	return row;
}

/**
 * The draft (or posted) issue filling a requisition, if any — found by the issue's link back, since
 * `issueId` is set only once the issue is posted.
 */
export async function issuesForRequisition(orgId: number, requisitionId: number) {
	return db
		.select({
			id: stockDocument.id,
			number: stockDocument.number,
			status: stockDocument.status,
			docDate: stockDocument.docDate
		})
		.from(stockDocument)
		.where(
			and(
				eq(stockDocument.orgId, orgId),
				eq(stockDocument.requisitionId, requisitionId),
				ne(stockDocument.status, 'cancelled')
			)
		)
		.orderBy(desc(stockDocument.id));
}

/** What the store holds of each item now, in base units — for the approver. */
export async function onHandAtStore(orgId: number, locationId: number, itemIds: number[]) {
	if (!itemIds.length) return new Map<number, number>();
	const rows = await db
		.select({
			itemId: stockBalance.itemId,
			quantity: sql<number>`COALESCE(SUM(${stockBalance.quantity}), 0)`
		})
		.from(stockBalance)
		.where(
			and(
				eq(stockBalance.orgId, orgId),
				eq(stockBalance.locationId, locationId),
				inArray(stockBalance.itemId, itemIds)
			)
		)
		.groupBy(stockBalance.itemId);
	return new Map(rows.map((r) => [r.itemId, round4(Number(r.quantity))]));
}
