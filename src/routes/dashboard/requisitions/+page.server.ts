import { superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { redirect } from 'sveltekit-flash-message/server';
import { hasPermission, requirePermission } from '@nahu/admin-kit/server/permissions';
import { localToday } from '@nahu/admin-kit/time';
import { db } from '$lib/server/db';
import { requisition } from '$lib/server/db/schema';
import { orgIdOf } from '$lib/server/tenant';
import { locationOptions } from '$lib/server/options';
import { branchScope } from '$lib/server/scope';
import { departmentNames, requisitionList } from '$lib/server/requisitions';
import { requisitionHeader } from '$lib/schemas/requisitions';
import { attemptForm, invalidForm } from '$lib/server/actions';
import { pickedStore } from '$lib/server/checks';
import { m } from '$lib/paraglide/messages.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const orgId = orgIdOf(locals);
	const scope = await branchScope(locals);
	const [requisitions, locations, departments, form] = await Promise.all([
		requisitionList(orgId, scope),
		locationOptions(orgId, scope),
		departmentNames(orgId),
		superValidate({ requestDate: localToday() }, zod4(requisitionHeader), { errors: false })
	]);
	return {
		requisitions,
		locations,
		departments,
		form,
		canRequest: hasPermission(locals, 'requisitions.request'),
		waiting: requisitions.filter((r) => r.status === 'submitted').length,
		toIssue: requisitions.filter((r) => r.status === 'approved').length
	};
};

export const actions: Actions = {
	/** A new draft requisition. Lines are added on its own page. */
	create: async (event) => {
		requirePermission(event.locals, 'requisitions.request');
		const orgId = orgIdOf(event.locals);
		const form = await superValidate(event.request, zod4(requisitionHeader));
		if (!form.valid) return invalidForm(form);

		return attemptForm(form, async () => {
			const loc = await pickedStore(
				event.locals,
				orgId,
				form.data.locationId,
				m.purchasing_v_store_from_list(),
				{ noTransit: true }
			);

			const [row] = await db
				.insert(requisition)
				.values({
					orgId,
					branchId: loc.branchId,
					locationId: loc.id,
					department: form.data.department,
					requestDate: form.data.requestDate,
					neededBy: form.data.neededBy || null,
					note: form.data.note || null,
					createdBy: event.locals.user?.id
				})
				.$returningId();

			redirect(
				`/dashboard/requisitions/${row.id}`,
				{ type: 'success', message: m.purchasing_req_drafted() },
				event.cookies
			);
		});
	}
};
