import { message, setError, superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { isDuplicateKey } from '@nahu/admin-kit/server/dbErrors';
import { hasPermission, requirePermission } from '@nahu/admin-kit/server/permissions';
import { db } from '$lib/server/db';
import { supplier } from '$lib/server/db/schema';
import { orgIdOf } from '$lib/server/tenant';
import { supplierList, supplierValues } from '$lib/server/suppliers';
import { supplierSchema } from '$lib/schemas/suppliers';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => ({
	suppliers: await supplierList(orgIdOf(locals)),
	form: await superValidate(zod4(supplierSchema)),
	canManage: hasPermission(locals, 'suppliers.manage')
});

export const actions: Actions = {
	/**
	 * Adds a supplier. Also the target of the "+ New supplier" dialog on other pages, which is why
	 * it returns the new supplier as a picker option: the form that asked selects it straight away.
	 */
	add: async (event) => {
		requirePermission(event.locals, 'suppliers.manage');
		const orgId = orgIdOf(event.locals);
		const form = await superValidate(event.request, zod4(supplierSchema));
		if (!form.valid) {
			return message(form, { type: 'error', text: 'Please check the form' }, { status: 400 });
		}

		try {
			const values = supplierValues(form.data);
			const [row] = await db
				.insert(supplier)
				.values({ ...values, orgId, createdBy: event.locals.user?.id })
				.$returningId();
			form.message = { type: 'success', text: `${values.name} added` };
			return { form, supplier: { value: row.id, name: `${values.name} · ${values.phone}` } };
		} catch (err) {
			if (isDuplicateKey(err)) {
				setError(form, 'name', 'A supplier with this name already exists.');
				return message(
					form,
					{ type: 'error', text: 'That supplier already exists.' },
					{ status: 409 }
				);
			}
			throw err;
		}
	}
};
