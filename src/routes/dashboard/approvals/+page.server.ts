import { fail } from '@sveltejs/kit';
import { hasPermission, requirePermission } from '@nahu/admin-kit/server/permissions';
import { db } from '$lib/server/db';
import { orgIdOf } from '$lib/server/tenant';
import {
	approvalList,
	currentValue,
	decideApproval,
	withdrawApproval
} from '$lib/server/approvals';
import { branchScope, inScope } from '$lib/server/scope';
import { attempt } from '$lib/server/actions';
import { m } from '$lib/paraglide/messages.js';
import type { Actions, PageServerLoad, RequestEvent } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const orgId = orgIdOf(locals);
	const scope = await branchScope(locals);
	const all = (await approvalList(orgId)).filter((r) => inScope(scope, r.branchId));
	const pending = await Promise.all(
		all
			.filter((r) => r.status === 'pending')
			.map(async (r) => ({ ...r, currentValue: await currentValue(orgId, r) }))
	);
	return {
		pending,
		history: all.filter((r) => r.status !== 'pending'),
		userId: locals.user?.id ?? null,
		canDecide: hasPermission(locals, 'approvals.decide')
	};
};

/** The request named in the form: this business's, in one of the viewer's branches. */
async function requestOf(event: RequestEvent) {
	const orgId = orgIdOf(event.locals);
	const data = await event.request.formData();
	const id = Number(data.get('id'));
	const scope = await branchScope(event.locals);
	const found = (await approvalList(orgId)).find((r) => r.id === id);
	if (!found || !inScope(scope, found.branchId)) return null;
	return { orgId, id, note: String(data.get('note') ?? '').trim() || null };
}

async function decide(event: RequestEvent, approve: boolean) {
	requirePermission(event.locals, 'approvals.decide');
	const req = await requestOf(event);
	if (!req) return fail(404);
	return attempt(event, async () => {
		const { done } = await db.transaction((tx) =>
			decideApproval(tx, {
				orgId: req.orgId,
				requestId: req.id,
				userId: event.locals.user!.id,
				approve,
				note: req.note
			})
		);
		return done;
	});
}

export const actions: Actions = {
	/** Approving does the thing — posts the adjustment or count, orders the order — in the approver's name. */
	approve: (event) => decide(event, true),
	reject: (event) => decide(event, false),

	/** The person who asked takes it back, to change it. */
	withdraw: async (event) => {
		const req = await requestOf(event);
		if (!req) return fail(404);
		return attempt(event, async () => {
			await db.transaction((tx) =>
				withdrawApproval(tx, { orgId: req.orgId, requestId: req.id, userId: event.locals.user!.id })
			);
			return m.purchasing_appr_withdrawn_msg();
		});
	}
};
