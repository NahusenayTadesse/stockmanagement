import { eq } from 'drizzle-orm';
import { message, setError, superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { isDuplicateKey } from '@nahu/admin-kit/server/dbErrors';
import { hasPermission, requirePermission } from '@nahu/admin-kit/server/permissions';
import { recordAudit } from '@nahu/admin-kit/server/audit';
import { db } from '$lib/server/db';
import { supplier } from '$lib/server/db/schema';
import { orgIdOf } from '$lib/server/tenant';
import { orgSupplier, supplierDetail, supplierValues } from '$lib/server/suppliers';
import { supplierEdit } from '$lib/schemas/suppliers';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
	const orgId = orgIdOf(locals);
	const s = await orgSupplier(orgId, Number(params.id));
	const [detail, form] = await Promise.all([
		supplierDetail(orgId, s.id),
		superValidate(
			{
				name: s.name,
				phone: s.phone,
				email: s.email ?? '',
				address: s.address ?? '',
				tin: s.tin ?? '',
				contactPerson: s.contactPerson ?? '',
				note: s.note ?? '',
				vatRegistered: s.vatRegistered,
				leadTimeDays: s.leadTimeDays,
				status: s.isActive
			},
			zod4(supplierEdit),
			{ errors: false }
		)
	]);
	return { supplier: s, ...detail, form, canManage: hasPermission(locals, 'suppliers.manage') };
};

export const actions: Actions = {
	/** Details, and active/inactive: an inactive supplier keeps its history but leaves the pickers. */
	edit: async (event) => {
		requirePermission(event.locals, 'suppliers.manage');
		const orgId = orgIdOf(event.locals);
		const form = await superValidate(event.request, zod4(supplierEdit));
		if (!form.valid)
			return message(form, { type: 'error', text: 'Please check the form' }, { status: 400 });

		const before = await orgSupplier(orgId, Number(event.params.id));
		const after = { ...supplierValues(form.data), isActive: form.data.status };
		try {
			await db.transaction(async (tx) => {
				await tx
					.update(supplier)
					.set({ ...after, updatedBy: event.locals.user?.id })
					.where(eq(supplier.id, before.id));
				await recordAudit(tx, event, {
					table: 'supplier',
					recordId: before.id,
					action: 'update',
					before,
					after
				});
			});
		} catch (err) {
			if (isDuplicateKey(err)) {
				setError(form, 'name', 'Another supplier already has this name.');
				return message(form, { type: 'error', text: 'That name is taken.' }, { status: 409 });
			}
			throw err;
		}
		return message(form, { type: 'success', text: 'Supplier saved' });
	}
};
