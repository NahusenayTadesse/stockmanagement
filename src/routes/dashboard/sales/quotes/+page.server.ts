import { superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { redirect } from 'sveltekit-flash-message/server';
import { hasPermission, requirePermission } from '@nahu/admin-kit/server/permissions';
import { WriteRefused } from '@nahu/admin-kit/server/childCrud';
import { addLocalDays, localToday } from '@nahu/admin-kit/time';
import { db } from '$lib/server/db';
import { quote } from '$lib/server/db/schema';
import { orgIdOf } from '$lib/server/tenant';
import { locationOptions, branchOptions } from '$lib/server/options';
import { customerChoices } from '$lib/server/customers';
import { attemptForm, invalidForm } from '$lib/server/actions';
import { quoteList } from '$lib/server/quotes';
import { quoteHeader } from '$lib/schemas/quotes';
import { m } from '$lib/paraglide/messages.js';
import { checkHeader, headerValues } from './header.server';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const orgId = orgIdOf(locals);
	const today = localToday();
	const [quotes, customers, locations, form] = await Promise.all([
		quoteList(orgId),
		customerChoices(orgId),
		locationOptions(orgId),
		superValidate({ quoteDate: today, validUntil: addLocalDays(today, 30) }, zod4(quoteHeader), {
			errors: false
		})
	]);
	return {
		quotes: quotes.map((q) => ({
			...q,
			// Past its date and not yet acted on: shown as expired.
			status:
				(q.status === 'draft' || q.status === 'sent') && q.validUntil && q.validUntil < today
					? ('expired' as const)
					: q.status
		})),
		customers: customers ?? [],
		locations,
		form,
		canManage: hasPermission(locals, 'sales.manage')
	};
};

export const actions: Actions = {
	create: async (event) => {
		requirePermission(event.locals, 'sales.manage');
		const orgId = orgIdOf(event.locals);
		const form = await superValidate(event.request, zod4(quoteHeader));
		if (!form.valid) return invalidForm(form);

		return attemptForm(form, async () => {
			// The branch numbers it: the location's, or the first branch when none is chosen yet.
			const branchId =
				(await checkHeader(orgId, form.data)) ?? (await branchOptions(orgId))[0]?.value ?? null;
			if (!branchId) throw new WriteRefused(null, m.sales_add_branch_first());

			const [row] = await db
				.insert(quote)
				.values({
					orgId,
					branchId,
					...headerValues(form.data),
					createdBy: event.locals.user?.id
				})
				.$returningId();
			redirect(
				`/dashboard/sales/quotes/${row.id}`,
				{ type: 'success', message: m.sales_quote_started() },
				event.cookies
			);
		});
	}
};
