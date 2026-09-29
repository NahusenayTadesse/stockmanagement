import { error, fail } from '@sveltejs/kit';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { message, setError, superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { redirect, setFlash } from 'sveltekit-flash-message/server';
import { childActions, childCrud } from '@nahu/admin-kit/server/childCrud';
import { hasPermission, requirePermission } from '@nahu/admin-kit/server/permissions';
import { localToday } from '@nahu/admin-kit/time';
import { db } from '$lib/server/db';
import { item, location, requisition, requisitionLine, uom } from '$lib/server/db/schema';
import { orgIdOf } from '$lib/server/tenant';
import { itemOptions, locationOptions, unitOptions } from '$lib/server/options';
import { orderLineValues } from '$lib/server/orderLines';
import { branchScope, inScope, requireBranch } from '$lib/server/scope';
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
	label: 'Line',
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
		error(409, 'This requisition has been submitted and its lines can no longer change.');
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
		units: [{ value: 0, name: 'Base unit' }, ...units],
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

/** Runs a change, turning refusals into a flash message. */
async function attempt(event: RequestEvent, run: () => Promise<string>) {
	try {
		const text = await run();
		setFlash({ type: 'success', message: text }, event.cookies);
		return { done: true };
	} catch (err) {
		if (err instanceof StockError) {
			setFlash({ type: 'error', message: err.message }, event.cookies);
			return fail(409, { refused: err.message });
		}
		throw err;
	}
}

export const actions: Actions = {
	...childActions({ Line: lines }, draftOwner),

	editHeader: async (event) => {
		requirePermission(event.locals, 'requisitions.request');
		const orgId = orgIdOf(event.locals);
		const form = await superValidate(event.request, zod4(requisitionHeader));
		if (!form.valid) {
			return message(form, { type: 'error', text: 'Please check the form' }, { status: 400 });
		}
		const req = await mine(event);
		if (req.status !== 'draft') {
			return message(form, { type: 'error', text: 'Only a draft can change.' }, { status: 409 });
		}
		const [loc] = await db
			.select({ id: location.id, branchId: location.branchId, kind: location.kind })
			.from(location)
			.where(
				and(
					eq(location.id, form.data.locationId),
					eq(location.orgId, orgId),
					isNull(location.deletedAt)
				)
			);
		if (!loc || loc.kind === 'transit' || !inScope(await branchScope(event.locals), loc.branchId)) {
			setError(form, 'locationId', 'Choose a store from the list.');
			return message(
				form,
				{ type: 'error', text: 'Choose a store from the list.' },
				{ status: 400 }
			);
		}
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
		return message(form, { type: 'success', text: 'Saved' });
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
			return `Submitted as ${number} — someone who may approve requisitions decides next`;
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
			return 'Approved — the store can issue it';
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
			return 'Rejected';
		});
	},

	/** The draft issue that fills it, opened for the storekeeper to check lots and post. */
	issue: async (event) => {
		requirePermission(event.locals, 'stock.draft');
		const req = await mine(event);
		let documentId: number;
		try {
			documentId = await db.transaction((tx) =>
				issueFromRequisition(tx, {
					orgId: req.orgId,
					requisitionId: req.id,
					date: localToday(),
					userId: event.locals.user?.id
				})
			);
		} catch (err) {
			if (err instanceof StockError) {
				setFlash({ type: 'error', message: err.message }, event.cookies);
				return fail(409, { refused: err.message });
			}
			throw err;
		}
		redirect(
			`/dashboard/stock/documents/${documentId}`,
			{ type: 'success', message: 'Issue drafted from the requisition — check it, then post' },
			event.cookies
		);
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
			return 'Requisition cancelled';
		});
	}
};
