import { message, setError, superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { redirect } from 'sveltekit-flash-message/server';
import { and, eq, isNull } from 'drizzle-orm';
import { hasPermission, requirePermission } from '@nahu/admin-kit/server/permissions';
import { addLocalDays, localToday } from '@nahu/admin-kit/time';
import { db } from '$lib/server/db';
import { location, quote } from '$lib/server/db/schema';
import { orgIdOf } from '$lib/server/tenant';
import { locationOptions, branchOptions } from '$lib/server/options';
import { checkCustomer, customerChoices } from '$lib/server/customers';
import { quoteList } from '$lib/server/quotes';
import { quoteHeader } from '$lib/schemas/quotes';
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
		if (!form.valid)
			return message(form, { type: 'error', text: 'Please check the form' }, { status: 400 });

		if (form.data.customerId && !(await checkCustomer(orgId, form.data.customerId))) {
			setError(form, 'customerId', 'Choose a customer from the list.');
			return message(
				form,
				{ type: 'error', text: 'Choose a customer from the list.' },
				{ status: 400 }
			);
		}
		// The branch numbers it: the location's, or the first branch when none is chosen yet.
		let branchId: number | null = null;
		if (form.data.locationId) {
			const [loc] = await db
				.select({ branchId: location.branchId })
				.from(location)
				.where(
					and(
						eq(location.id, form.data.locationId),
						eq(location.orgId, orgId),
						isNull(location.deletedAt)
					)
				);
			if (!loc) {
				setError(form, 'locationId', 'Choose a location from the list.');
				return message(
					form,
					{ type: 'error', text: 'Choose a location from the list.' },
					{ status: 400 }
				);
			}
			branchId = loc.branchId;
		}
		branchId ??= (await branchOptions(orgId))[0]?.value ?? null;
		if (!branchId)
			return message(form, { type: 'error', text: 'Add a branch first.' }, { status: 400 });

		const [row] = await db
			.insert(quote)
			.values({
				orgId,
				branchId,
				customerId: form.data.customerId || null,
				buyerName: form.data.customerId ? null : form.data.buyerName || null,
				buyerTin: form.data.buyerTin || null,
				buyerPhone: form.data.buyerPhone || null,
				locationId: form.data.locationId || null,
				quoteDate: form.data.quoteDate,
				validUntil: form.data.validUntil || null,
				reference: form.data.reference || null,
				note: form.data.note || null,
				terms: form.data.terms || null,
				createdBy: event.locals.user?.id
			})
			.$returningId();
		redirect(
			`/dashboard/sales/quotes/${row.id}`,
			{ type: 'success', message: 'Proforma started — add the lines' },
			event.cookies
		);
	}
};
