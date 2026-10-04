import { redirect } from 'sveltekit-flash-message/server';
import { hasPermission, requirePermission } from '@nahu/admin-kit/server/permissions';
import { localToday } from '@nahu/admin-kit/time';
import { db } from '$lib/server/db';
import { orgIdOf } from '$lib/server/tenant';
import { locationOptions } from '$lib/server/options';
import { ordersFromReorder, reorderSuggestions } from '$lib/server/purchasing';
import { StockError } from '$lib/server/stock/post';
import { branchScope, viewScope, inScope } from '$lib/server/scope';
import { location } from '$lib/server/db/schema';
import { and, eq } from 'drizzle-orm';
import { m } from '$lib/paraglide/messages.js';
import { attempt } from '$lib/server/actions';
import type { Actions, PageServerLoad } from './$types';

/**
 * `?location=` plans one location by its reorder rules; without it, the whole business by each
 * item's reorder level. Either way, items about to run out at their rate of use are listed too.
 */
export const load: PageServerLoad = async ({ locals, url }) => {
	const orgId = orgIdOf(locals);
	const scope = await viewScope(locals, url);
	const locations = await locationOptions(orgId, scope);
	const wanted = Number(url.searchParams.get('location')) || null;
	const locationId = locations.some((l) => l.value === wanted) ? wanted : null;
	const items = await reorderSuggestions(orgId, db, { locationId, scope });
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

		return attempt(
			event,
			async () => {
				// Deliveries go to one of the viewer's own locations.
				const locationId = Number(form.get('locationId'));
				const [loc] = await db
					.select({ branchId: location.branchId })
					.from(location)
					.where(and(eq(location.id, locationId), eq(location.orgId, orgId)));
				if (!loc || !inScope(await branchScope(event.locals), loc.branchId)) {
					throw new StockError(m.purchasing_reorder_choose_delivery());
				}

				const ids = await db.transaction((tx) =>
					ordersFromReorder(tx, {
						orgId,
						locationId,
						date: localToday(),
						picks,
						userId: event.locals.user?.id
					})
				);
				const text =
					ids.length === 1
						? m.purchasing_reorder_created_one()
						: m.purchasing_reorder_created_many({ n: ids.length });
				redirect(
					ids.length === 1 ? `/dashboard/purchasing/${ids[0]}` : '/dashboard/purchasing',
					{ type: 'success', message: text },
					event.cookies
				);
			},
			{ status: 400 }
		);
	}
};
