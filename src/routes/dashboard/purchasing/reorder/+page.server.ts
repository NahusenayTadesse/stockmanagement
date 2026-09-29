import { fail } from '@sveltejs/kit';
import { redirect, setFlash } from 'sveltekit-flash-message/server';
import { hasPermission, requirePermission } from '@nahu/admin-kit/server/permissions';
import { localToday } from '@nahu/admin-kit/time';
import { db } from '$lib/server/db';
import { orgIdOf } from '$lib/server/tenant';
import { locationOptions } from '$lib/server/options';
import { ordersFromReorder, reorderSuggestions } from '$lib/server/purchasing';
import { StockError } from '$lib/server/stock/post';
import { branchScope, inScope } from '$lib/server/scope';
import { location } from '$lib/server/db/schema';
import { and, eq } from 'drizzle-orm';
import type { Actions, PageServerLoad } from './$types';

/**
 * `?location=` plans one location by its reorder rules; without it, the whole business by each
 * item's reorder level. Either way, items about to run out at their rate of use are listed too.
 */
export const load: PageServerLoad = async ({ locals, url }) => {
	const orgId = orgIdOf(locals);
	const locations = await locationOptions(orgId, await branchScope(locals));
	const wanted = Number(url.searchParams.get('location')) || null;
	const locationId = locations.some((l) => l.value === wanted) ? wanted : null;
	const items = await reorderSuggestions(orgId, db, { locationId });
	return {
		items,
		locations,
		locationId,
		canManage: hasPermission(locals, 'purchasing.manage')
	};
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

		// Deliveries go to one of the viewer's own locations.
		const locationId = Number(form.get('locationId'));
		const [loc] = await db
			.select({ branchId: location.branchId })
			.from(location)
			.where(and(eq(location.id, locationId), eq(location.orgId, orgId)));
		if (!loc || !inScope(await branchScope(event.locals), loc.branchId)) {
			setFlash(
				{ type: 'error', message: 'Choose where the orders should be delivered.' },
				event.cookies
			);
			return fail(400);
		}

		let ids: number[];
		try {
			ids = await db.transaction((tx) =>
				ordersFromReorder(tx, {
					orgId,
					locationId,
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
