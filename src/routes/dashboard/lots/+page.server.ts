import { m } from '$lib/paraglide/messages.js';
import { and, eq } from 'drizzle-orm';
import { message, superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { hasPermission, requirePermission } from '@nahu/admin-kit/server/permissions';
import { idSchema } from '@nahu/admin-kit/server/crud';
import { db } from '$lib/server/db';
import { lot } from '$lib/server/db/schema';
import { orgIdOf } from '$lib/server/tenant';
import { lotRows } from '$lib/server/stock/queries';
import { lotEdit } from '$lib/schemas/stock';
import { invalidForm } from '$lib/server/actions';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const [rows, addForm, editForm, deleteForm] = await Promise.all([
		lotRows(orgIdOf(locals)),
		superValidate(zod4(lotEdit)),
		superValidate(zod4(lotEdit)),
		superValidate(zod4(idSchema))
	]);
	return {
		rows: rows.map((r) => ({ ...r, note: r.note ?? '', onHand: Number(r.onHand) })),
		addForm,
		editForm,
		deleteForm,
		canManage: hasPermission(locals, 'lots.manage')
	};
};

export const actions: Actions = {
	/**
	 * Quarantine, recall or release a lot. Posting reads this: a lot that is not `available` is
	 * never issued, only written off or moved into quarantine.
	 */
	edit: async (event) => {
		requirePermission(event.locals, 'lots.manage');
		const form = await superValidate(event.request, zod4(lotEdit));
		if (!form.valid) return invalidForm(form);

		const result = await db
			.update(lot)
			.set({ status: form.data.status, note: form.data.note || null })
			.where(and(eq(lot.id, form.data.id), eq(lot.orgId, orgIdOf(event.locals))));

		if (!result[0].affectedRows) {
			return message(form, { type: 'error', text: m.stock_lot_gone() }, { status: 404 });
		}
		return message(form, { type: 'success', text: m.stock_lot_updated() });
	}
};
