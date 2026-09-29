import { error } from '@sveltejs/kit';
import { and, eq, inArray } from 'drizzle-orm';
import { superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { redirect } from 'sveltekit-flash-message/server';
import { childActions, childCrud } from '@nahu/admin-kit/server/childCrud';
import { hasPermission, requirePermission } from '@nahu/admin-kit/server/permissions';
import { localToday } from '@nahu/admin-kit/time';
import { db } from '$lib/server/db';
import { item, requisition, requisitionLine, uom } from '$lib/server/db/schema';
import { orgIdOf } from '$lib/server/tenant';
import { itemOptions, locationOptions, unitOptions } from '$lib/server/options';
import { orderLineValues } from '$lib/server/orderLines';
import { branchScope, requireBranch } from '$lib/server/scope';
import {
	cancelRequisition,
	decideRequisition,
	departmentNames,
	issueFromRequisition,
	issuesForRequisition,
	onHandAtStore,
	orgRequisition,
	requisitionDetail,
	requisitionLines,
	submitRequisition
} from '$lib/server/requisitions';
import { StockError } from '$lib/server/stock/post';
import { smsRequisitionSubmitted } from '$lib/server/sms';
import { attempt, attemptForm, invalidForm } from '$lib/server/actions';
import { pickedStore } from '$lib/server/checks';
import { m } from '$lib/paraglide/messages.js';
import {
	requisitionHeader,
	requisitionLineAdd,
	requisitionLineEdit
} from '$lib/schemas/requisitions';
import type { Actions, PageServerLoad, RequestEvent } from './$types';

/** The requisition, if it is this business's and in one of the viewer's branches. */
async function mine(event: Pick<RequestEvent, 'locals' | 'params'>) {
	const req = await orgRequisition(orgIdOf(event.locals), Number(event.params.id));
	await requireBranch(event.locals, req.branchId);
	return req;
}

const lines = childCrud({
	table: requisitionLine,
	ownerColumn: 'requisitionId',
	label: () => m.common_rec_line(),
	addSchema: requisitionLineAdd,
	editSchema: requisitionLineEdit,
	permission: 'requisitions.request',
	// A stock item, in a unit it has a conversion for — the same check as an order line.
	transform: async (values, event) => orderLineValues(values, orgIdOf(event.locals))
});

/** Lines change only while it is a draft: once submitted, the approver is deciding on them. */
async function draftOwner(event: RequestEvent) {
	const req = await mine(event);
	if (req.status !== 'draft') {
		error(409, m.purchasing_req_lines_locked());
	}
	return req.id;
}

export const load: PageServerLoad = async (event) => {
	const { locals } = event;
	const orgId = orgIdOf(locals);
	const req = await mine(event);
	const isDraft = req.status === 'draft';
	const canRequest = hasPermission(locals, 'requisitions.request');

	const [lineSection, detailed, details, issues, items, units] = await Promise.all([
		lines.load(req.id),
		requisitionLines(orgId, req.id),
		requisitionDetail(orgId, req.id),
		issuesForRequisition(orgId, req.id),
		isDraft ? itemOptions(orgId) : Promise.resolve([]),
		isDraft ? unitOptions(orgId) : Promise.resolve([])
	]);

	// What the store holds of each item, in base units, next to what is asked for.
	const [stocked, baseUnits] = await Promise.all([
		onHandAtStore(
			orgId,
			req.locationId,
			detailed.map((l) => l.itemId)
		),
		detailed.length
			? db
					.select({ id: item.id, unit: uom.symbol })
					.from(item)
					.innerJoin(uom, eq(uom.id, item.baseUomId))
					.where(
						and(
							eq(item.orgId, orgId),
							inArray(
								item.id,
								detailed.map((l) => l.itemId)
							)
						)
					)
			: Promise.resolve([])
	]);
	const baseUnit = new Map(baseUnits.map((b) => [b.id, b.unit]));
	const byId = new Map(detailed.map((l) => [l.id, l]));
	const rows = (lineSection.rows as (typeof requisitionLine.$inferSelect)[]).map((l) => {
		const d = byId.get(l.id);
		return {
			...l,
			item: d?.item ?? '—',
			unit: d?.unit ?? '—',
			note: l.note ?? '',
			onHand: stocked.get(l.itemId) ?? 0,
			baseUnit: baseUnit.get(l.itemId) ?? ''
		};
	});

	return {
		req,
		details,
		issues,
		lines: { ...lineSection, rows },
		items,
		units: [{ value: 0, name: m.purchasing_base_unit() }, ...units],
		headerForm: await superValidate(
			{
				department: req.department,
				locationId: req.locationId,
				requestDate: req.requestDate,
				neededBy: req.neededBy ?? '',
				note: req.note ?? ''
			},
			zod4(requisitionHeader),
			{ errors: false }
		),
		locations: isDraft && canRequest ? await locationOptions(orgId, await branchScope(locals)) : [],
		departments: isDraft && canRequest ? await departmentNames(orgId) : [],
		canRequest,
		canApprove: hasPermission(locals, 'requisitions.approve'),
		canIssue: hasPermission(locals, 'stock.draft'),
		/** Who submitted it may not decide it. */
		isAsker: !!req.submittedBy && req.submittedBy === locals.user?.id
	};
};

export const actions: Actions = {
	...childActions({ Line: lines }, draftOwner),

	editHeader: async (event) => {
		requirePermission(event.locals, 'requisitions.request');
		const orgId = orgIdOf(event.locals);
		const form = await superValidate(event.request, zod4(requisitionHeader));
		if (!form.valid) return invalidForm(form);
		const req = await mine(event);

		return attemptForm(form, async () => {
			if (req.status !== 'draft') throw new StockError(m.purchasing_only_draft_changes());
			const loc = await pickedStore(
				event.locals,
				orgId,
				form.data.locationId,
				m.purchasing_v_store_from_list(),
				{ noTransit: true }
			);
			await db
				.update(requisition)
				.set({
					department: form.data.department,
					locationId: loc.id,
					branchId: loc.branchId,
					requestDate: form.data.requestDate,
					neededBy: form.data.neededBy || null,
					note: form.data.note || null,
					updatedBy: event.locals.user?.id
				})
				.where(eq(requisition.id, req.id));
			return m.common_saved();
		});
	},

	/** Sent for approval: it gets its number and its lines are fixed. */
	submit: async (event) => {
		requirePermission(event.locals, 'requisitions.request');
		const req = await mine(event);
		return attempt(event, async () => {
			const number = await db.transaction((tx) =>
				submitRequisition(tx, {
					orgId: req.orgId,
					requisitionId: req.id,
					userId: event.locals.user?.id
				})
			);
			// The alert numbers hear of it, when the business sends alerts.
			await smsRequisitionSubmitted(req.orgId, req.id);
			return m.purchasing_req_submitted_as({ number });
		});
	},

	/** Approved at the quantities on the sheet (`qty_<lineId>`); 0 refuses a line. */
	approve: async (event) => {
		requirePermission(event.locals, 'requisitions.approve');
		const req = await mine(event);
		const data = await event.request.formData();
		const quantities = new Map<number, number>();
		for (const [key, value] of data) {
			const m = /^qty_(\d+)$/.exec(key);
			if (m && String(value).trim() !== '') quantities.set(Number(m[1]), Number(value));
		}
		return attempt(event, async () => {
			await db.transaction((tx) =>
				decideRequisition(tx, {
					orgId: req.orgId,
					requisitionId: req.id,
					userId: event.locals.user!.id,
					approve: true,
					quantities,
					note: String(data.get('note') ?? '')
				})
			);
			return m.purchasing_req_approved_msg();
		});
	},

	reject: async (event) => {
		requirePermission(event.locals, 'requisitions.approve');
		const req = await mine(event);
		const data = await event.request.formData();
		return attempt(event, async () => {
			await db.transaction((tx) =>
				decideRequisition(tx, {
					orgId: req.orgId,
					requisitionId: req.id,
					userId: event.locals.user!.id,
					approve: false,
					note: String(data.get('note') ?? '')
				})
			);
			return m.purchasing_req_rejected_msg();
		});
	},

	/** The draft issue that fills it, opened for the storekeeper to check lots and post. */
	issue: async (event) => {
		requirePermission(event.locals, 'stock.draft');
		const req = await mine(event);
		return attempt(event, async () => {
			const documentId = await db.transaction((tx) =>
				issueFromRequisition(tx, {
					orgId: req.orgId,
					requisitionId: req.id,
					date: localToday(),
					userId: event.locals.user?.id
				})
			);
			redirect(
				`/dashboard/stock/documents/${documentId}`,
				{ type: 'success', message: m.purchasing_req_issue_drafted() },
				event.cookies
			);
		});
	},

	cancel: async (event) => {
		const req = await mine(event);
		// The department withdraws its own; an approver may call off any.
		if (!hasPermission(event.locals, 'requisitions.approve')) {
			requirePermission(event.locals, 'requisitions.request');
		}
		return attempt(event, async () => {
			await db.transaction((tx) =>
				cancelRequisition(tx, {
					orgId: req.orgId,
					requisitionId: req.id,
					userId: event.locals.user?.id
				})
			);
			return m.purchasing_req_cancelled_msg();
		});
	}
};
