import { message, setError, superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { hasPermission, requirePermission } from '@nahu/admin-kit/server/permissions';
import { db } from '$lib/server/db';
import { customer } from '$lib/server/db/schema';
import { orgIdOf } from '$lib/server/tenant';
import { customerList, customerValues, duplicateCustomer } from '$lib/server/customers';
import { creditSummary } from '$lib/server/credit';
import { customerSchema } from '$lib/schemas/customers';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const orgId = orgIdOf(locals);
	const [list, credit, form] = await Promise.all([
		customerList(orgId),
		creditSummary(orgId),
		superValidate(zod4(customerSchema))
	]);
	const byId = new Map(credit.map((c) => [c.id, c]));
	return {
		customers: list.map((c) => {
			const pos = byId.get(c.id);
			return {
				...c,
				owed: pos?.balance ?? 0,
				overdue: pos?.overdue ?? 0,
				creditLimit: pos?.creditLimit ?? null,
				overLimit: pos?.overLimit ?? false
			};
		}),
		form,
		canManage: hasPermission(locals, 'customers.manage')
	};
};

export const actions: Actions = {
	/**
	 * Adds a customer. Also the target of "+ New customer" on the issue and payment forms, which is
	 * why it returns the new customer as a picker option.
	 */
	add: async (event) => {
		requirePermission(event.locals, 'customers.manage');
		const orgId = orgIdOf(event.locals);
		const form = await superValidate(event.request, zod4(customerSchema));
		if (!form.valid) {
			return message(form, { type: 'error', text: 'Please check the form' }, { status: 400 });
		}

		const values = customerValues(form.data);
		const dup = await duplicateCustomer(orgId, values.name, values.phone);
		if (dup) {
			const text = values.phone
				? 'A customer with this name and phone is already on the list.'
				: 'A customer with this name and no phone is already on the list. Add a phone to tell them apart.';
			setError(form, values.phone ? 'phone' : 'name', text);
			return message(form, { type: 'error', text }, { status: 409 });
		}

		const [row] = await db
			.insert(customer)
			.values({ ...values, orgId, createdBy: event.locals.user?.id })
			.$returningId();
		form.message = { type: 'success', text: `${values.name} added` };
		return {
			form,
			customer: {
				value: row.id,
				name: values.phone ? `${values.name} · ${values.phone}` : values.name
			}
		};
	}
};
