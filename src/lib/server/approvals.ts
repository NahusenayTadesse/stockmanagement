/**
 * Maker-checker. When posting an adjustment or a count, or ordering a purchase order, runs into
 * one of the business's limits, the service throws `ApprovalRequired`; the page records a request
 * here and says it is waiting. Someone else with `approvals.decide` then approves it — which does
 * the thing, in their name — or rejects it with a reason.
 *
 * The person who asked can never approve their own request: that is the point.
 */
import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/mysql-core';
import { localToday } from '@nahu/admin-kit/time';
import { db } from '$lib/server/db';
import {
	approvalRequest,
	item,
	itemUnit,
	stockDocumentLine,
	purchaseOrder,
	stockCount,
	stockDocument,
	location,
	user
} from '$lib/server/db/schema';
import { postDocument, StockError, type Tx } from '$lib/server/stock/post';
import type { ApprovalRequired } from '$lib/server/stock/errors';
import { countLines, postCount } from '$lib/server/counts';
import { markOrdered, orderLines } from '$lib/server/purchasing';
import { smsApprovalWaiting } from '$lib/server/sms';
import { m } from '$lib/paraglide/messages.js';
import { ADJUSTMENT_REASONS } from '$lib/format';

/** A request's status as a word in a sentence, in the viewer's language. */
function stateWord(status: string): string {
	const words: Record<string, () => string> = {
		pending: m.purchasing_appr_state_pending,
		approved: m.purchasing_appr_state_approved,
		rejected: m.purchasing_appr_state_rejected,
		withdrawn: m.purchasing_appr_state_withdrawn
	};
	return words[status]?.() ?? status;
}

export type Subject =
	| { kind: 'adjustment'; documentId: number }
	| { kind: 'count'; countId: number }
	| { kind: 'purchase_order'; purchaseOrderId: number };

function subjectWhere(subject: Subject) {
	return subject.kind === 'adjustment'
		? eq(approvalRequest.documentId, subject.documentId)
		: subject.kind === 'count'
			? eq(approvalRequest.countId, subject.countId)
			: eq(approvalRequest.purchaseOrderId, subject.purchaseOrderId);
}

/** The request waiting on this, if any. */
export async function pendingFor(
	orgId: number,
	subject: Subject,
	reader: Pick<typeof db, 'select'> = db
) {
	const [row] = await reader
		.select({
			id: approvalRequest.id,
			value: approvalRequest.value,
			reason: approvalRequest.reason,
			requestedAt: approvalRequest.requestedAt,
			requestedById: approvalRequest.requestedBy,
			requestedBy: user.name
		})
		.from(approvalRequest)
		.leftJoin(user, eq(user.id, approvalRequest.requestedBy))
		.where(
			and(
				eq(approvalRequest.orgId, orgId),
				eq(approvalRequest.status, 'pending'),
				subjectWhere(subject)
			)
		)
		.limit(1);
	return row ?? null;
}

/** The latest decision on this (to show why it was rejected), if any. */
export async function lastDecision(orgId: number, subject: Subject) {
	const decider = alias(user, 'decider');
	const [row] = await db
		.select({
			status: approvalRequest.status,
			decidedAt: approvalRequest.decidedAt,
			decisionNote: approvalRequest.decisionNote,
			decidedBy: decider.name
		})
		.from(approvalRequest)
		.leftJoin(decider, eq(decider.id, approvalRequest.decidedBy))
		.where(and(eq(approvalRequest.orgId, orgId), subjectWhere(subject)))
		.orderBy(desc(approvalRequest.id))
		.limit(1);
	return row ?? null;
}

/** Records that this waits for approval. Asking twice keeps the one request. */
export async function requestApproval(
	input: { orgId: number; userId?: string; subject: Subject; refusal: ApprovalRequired },
	writer: Pick<typeof db, 'select' | 'insert'> = db
): Promise<number> {
	const pending = await pendingFor(input.orgId, input.subject, writer);
	if (pending) return pending.id;
	const [row] = await writer
		.insert(approvalRequest)
		.values({
			orgId: input.orgId,
			kind: input.subject.kind,
			documentId: input.subject.kind === 'adjustment' ? input.subject.documentId : null,
			countId: input.subject.kind === 'count' ? input.subject.countId : null,
			purchaseOrderId:
				input.subject.kind === 'purchase_order' ? input.subject.purchaseOrderId : null,
			value: input.refusal.value,
			reason: input.refusal.reason.slice(0, 255),
			requestedBy: input.userId ?? null
		})
		.$returningId();
	// The approvers' phones hear of it, when the business sends alerts. After the commit when the
	// caller wrote with the database itself; a seed inside its own transaction sends nothing.
	if (writer === db) await smsApprovalWaiting(input.orgId, row.id);
	return row.id;
}

/**
 * Approves (doing the thing, in the approver's name) or rejects a request. Throws `StockError` if
 * it cannot: decided already, the approver asked for it, or the thing itself fails now (stock has
 * moved since) — in which case nothing changes and it stays pending.
 */
export async function decideApproval(
	tx: Tx,
	input: {
		orgId: number;
		requestId: number;
		userId: string;
		approve: boolean;
		note?: string | null;
		today?: string;
	}
): Promise<{ done: string }> {
	const [req] = await tx
		.select()
		.from(approvalRequest)
		.where(and(eq(approvalRequest.id, input.requestId), eq(approvalRequest.orgId, input.orgId)))
		.for('update');
	if (!req) throw new StockError(m.purchasing_appr_no_request());
	if (req.status !== 'pending') {
		throw new StockError(m.purchasing_appr_already({ status: stateWord(req.status) }));
	}
	if (req.requestedBy === input.userId) {
		throw new StockError(m.purchasing_appr_own());
	}
	if (!input.approve && !input.note?.trim()) {
		throw new StockError(m.purchasing_appr_reject_reason());
	}

	let done = m.purchasing_appr_done_rejected();
	if (input.approve) {
		const today = input.today ?? localToday();
		if (req.kind === 'adjustment') {
			const { number } = await postDocument(tx, {
				orgId: input.orgId,
				documentId: req.documentId!,
				userId: input.userId,
				today,
				approved: true
			});
			done = m.purchasing_appr_done_posted({ number });
		} else if (req.kind === 'count') {
			const r = await postCount(tx, {
				orgId: input.orgId,
				countId: req.countId!,
				userId: input.userId,
				today,
				approved: true
			});
			done = r.number
				? m.purchasing_appr_done_count_number({ number: r.number })
				: m.purchasing_appr_done_count();
		} else {
			const number = await markOrdered(tx, {
				orgId: input.orgId,
				orderId: req.purchaseOrderId!,
				userId: input.userId,
				approved: true
			});
			done = m.purchasing_appr_done_order({ number });
		}
	}

	await tx
		.update(approvalRequest)
		.set({
			status: input.approve ? 'approved' : 'rejected',
			decidedBy: input.userId,
			decidedAt: new Date(),
			decisionNote: input.note?.trim().slice(0, 255) || null
		})
		.where(eq(approvalRequest.id, req.id));
	return { done };
}

/** The person who asked takes it back (to change it, say). */
export async function withdrawApproval(
	tx: Tx,
	input: { orgId: number; requestId: number; userId: string }
) {
	const [req] = await tx
		.select()
		.from(approvalRequest)
		.where(and(eq(approvalRequest.id, input.requestId), eq(approvalRequest.orgId, input.orgId)))
		.for('update');
	if (!req || req.status !== 'pending') throw new StockError(m.purchasing_appr_nothing_waiting());
	if (req.requestedBy !== input.userId) {
		throw new StockError(m.purchasing_appr_only_requester());
	}
	await tx
		.update(approvalRequest)
		.set({ status: 'withdrawn', decidedAt: new Date(), decidedBy: input.userId })
		.where(eq(approvalRequest.id, req.id));
}

/** Requests, newest first, with what they are about and who was involved. */
export async function approvalList(orgId: number, filter: { status?: 'pending' } = {}) {
	const requester = alias(user, 'requester');
	const decider = alias(user, 'decider');
	const rows = await db
		.select({
			id: approvalRequest.id,
			kind: approvalRequest.kind,
			status: approvalRequest.status,
			value: approvalRequest.value,
			reason: approvalRequest.reason,
			requestedAt: approvalRequest.requestedAt,
			requestedById: approvalRequest.requestedBy,
			requestedBy: requester.name,
			decidedAt: approvalRequest.decidedAt,
			decidedBy: decider.name,
			decisionNote: approvalRequest.decisionNote,
			documentId: approvalRequest.documentId,
			documentNumber: stockDocument.number,
			documentReason: stockDocument.reason,
			countId: approvalRequest.countId,
			countLocation: location.name,
			purchaseOrderId: approvalRequest.purchaseOrderId,
			orderNumber: purchaseOrder.number,
			branchId: sql<
				number | null
			>`COALESCE(${stockDocument.branchId}, ${stockCount.branchId}, ${purchaseOrder.branchId})`
		})
		.from(approvalRequest)
		.leftJoin(requester, eq(requester.id, approvalRequest.requestedBy))
		.leftJoin(decider, eq(decider.id, approvalRequest.decidedBy))
		.leftJoin(stockDocument, eq(stockDocument.id, approvalRequest.documentId))
		.leftJoin(stockCount, eq(stockCount.id, approvalRequest.countId))
		.leftJoin(location, eq(location.id, stockCount.locationId))
		.leftJoin(purchaseOrder, eq(purchaseOrder.id, approvalRequest.purchaseOrderId))
		.where(
			and(
				eq(approvalRequest.orgId, orgId),
				filter.status ? eq(approvalRequest.status, filter.status) : undefined
			)
		)
		.orderBy(sql`${approvalRequest.status} = 'pending' DESC`, desc(approvalRequest.id))
		.limit(500);
	return rows.map((r) => ({
		...r,
		link:
			r.kind === 'adjustment'
				? `/dashboard/stock/documents/${r.documentId}`
				: r.kind === 'count'
					? `/dashboard/stock/counts/${r.countId}`
					: `/dashboard/purchasing/${r.purchaseOrderId}`,
		subject:
			r.kind === 'adjustment'
				? m.purchasing_appr_subject_adjustment({ id: r.documentId! }) +
					(r.documentReason
						? ` (${ADJUSTMENT_REASONS.find((x) => x.value === r.documentReason)?.name ?? r.documentReason})`
						: '')
				: r.kind === 'count'
					? r.countLocation
						? m.purchasing_appr_subject_count_at({ id: r.countId!, location: r.countLocation })
						: m.purchasing_appr_subject_count({ id: r.countId! })
					: m.purchasing_appr_subject_order({ id: r.purchaseOrderId! })
	}));
}

export async function pendingApprovals(orgId: number) {
	const [row] = await db
		.select({ n: sql<number>`COUNT(*)` })
		.from(approvalRequest)
		.where(and(eq(approvalRequest.orgId, orgId), eq(approvalRequest.status, 'pending')));
	return Number(row?.n ?? 0);
}

/**
 * What a page shows about approval of one thing: the request waiting on it, else the last
 * decision (so a rejection and its reason stay visible until it is sent again).
 */
export async function approvalState(orgId: number, subject: Subject) {
	const pending = await pendingFor(orgId, subject);
	const last = pending ? null : await lastDecision(orgId, subject);
	return {
		pending,
		last: last && (last.status === 'rejected' || last.status === 'approved') ? last : null
	};
}

/** The thing itself was cancelled: whatever waited on it no longer needs deciding. */
export async function closePendingFor(orgId: number, subject: Subject) {
	await db
		.update(approvalRequest)
		.set({ status: 'withdrawn', decidedAt: new Date() })
		.where(
			and(
				eq(approvalRequest.orgId, orgId),
				eq(approvalRequest.status, 'pending'),
				subjectWhere(subject)
			)
		);
}

/**
 * What a waiting request is worth now — the adjustment's lines at cost, the count's differences,
 * the order's lines — since the thing may have changed after it was asked for.
 */
export async function currentValue(
	orgId: number,
	r: {
		kind: string;
		documentId: number | null;
		countId: number | null;
		purchaseOrderId: number | null;
	}
): Promise<number> {
	let value = 0;
	if (r.kind === 'adjustment' && r.documentId) {
		const lines = await db
			.select({
				itemId: stockDocumentLine.itemId,
				uomId: stockDocumentLine.uomId,
				quantity: stockDocumentLine.quantity,
				unitCost: stockDocumentLine.unitCost,
				baseUomId: item.baseUomId,
				avgCost: item.avgCost
			})
			.from(stockDocumentLine)
			.innerJoin(item, eq(item.id, stockDocumentLine.itemId))
			.where(
				and(
					eq(stockDocumentLine.orgId, orgId),
					eq(stockDocumentLine.documentId, r.documentId),
					isNull(stockDocumentLine.deletedAt)
				)
			);
		const packs = lines.length
			? await db
					.select()
					.from(itemUnit)
					.where(
						and(
							inArray(
								itemUnit.itemId,
								lines.map((l) => l.itemId)
							),
							isNull(itemUnit.deletedAt)
						)
					)
			: [];
		for (const l of lines) {
			const factor =
				l.uomId === l.baseUomId
					? 1
					: (packs.find((p) => p.itemId === l.itemId && p.uomId === l.uomId)?.factor ?? 1);
			const cost = l.unitCost == null ? l.avgCost : l.unitCost / factor;
			value += Math.abs(l.quantity * factor) * cost;
		}
	} else if (r.kind === 'count' && r.countId) {
		value = (await countLines(orgId, r.countId)).reduce(
			(s, l) => s + Math.abs(l.varianceValue ?? 0),
			0
		);
	} else if (r.purchaseOrderId) {
		value = (await orderLines(orgId, r.purchaseOrderId)).reduce((s, l) => s + l.value, 0);
	}
	return Math.round(value * 100) / 100;
}
