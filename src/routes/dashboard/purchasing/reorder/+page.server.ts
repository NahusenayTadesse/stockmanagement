import { fail } from '@sveltejs/kit';
import { redirect, setFlash } from 'sveltekit-flash-message/server';
import { hasPermission, requirePermission } from '@nahu/admin-kit/server/permissions';
import { localToday } from '@nahu/admin-kit/time';
import { db } from '$lib/server/db';
import { orgIdOf } from '$lib/server/tenant';
import { locationOptions } from '$lib/server/options';
import { ordersFromReorder, reorderSuggestions } from '$lib/server/purchasing';
import { StockError } from '$lib/server/stock/post';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const orgId = orgIdOf(locals);
	const [items, locations] = await Promise.all([reorderSuggestions(orgId), locationOptions(orgId)]);
	return { items, locations, canManage: hasPermission(locals, 'purchasing.manage') };
};

export const actions: Actions = {
	/** One draft order per supplier from the ticked items. */
	create: async (event) => {
		requirePermission(event.locals, 'purchasing.manage');
		const orgId = orgIdOf(event.locals);
		const form = await event.request.formData();
		const picks = form
			.getAll('pick')
			.map(Number)
			.filter(Number.isInteger)
			.map((itemId) => ({ itemId, quantity: Number(form.get(`qty_${itemId}`)) }));

		let ids: number[];
		try {
			ids = await db.transaction((tx) =>
				ordersFromReorder(tx, {
					orgId,
					locationId: Number(form.get('locationId')),
					date: localToday(),
					picks,
					userId: event.locals.user?.id
				})
			);
		} catch (err) {
			if (err instanceof StockError) {
				setFlash({ type: 'error', message: err.message }, event.cookies);
				return fail(400, { refused: err.message });
			}
			throw err;
		}

		const text = `${ids.length} draft order${ids.length === 1 ? '' : 's'} created — check the prices, then mark them as ordered`;
		redirect(
			ids.length === 1 ? `/dashboard/purchasing/${ids[0]}` : '/dashboard/purchasing',
			{ type: 'success', message: text },
			event.cookies
		);
	}
};
