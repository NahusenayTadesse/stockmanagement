import { m } from '$lib/paraglide/messages.js';
import { localToday } from '@nahu/admin-kit/time';
import { orgIdOf } from '$lib/server/tenant';
import { onHandRows } from '$lib/server/stock/queries';
import { reservedByLocation } from '$lib/server/reservations';
import { viewScope } from '$lib/server/scope';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	const orgId = orgIdOf(locals);
	const [rows, held] = await Promise.all([
		onHandRows(orgId, { branchIds: await viewScope(locals, url) }),
		reservedByLocation(orgId, localToday())
	]);

	// What is held at a location is shared over its rows the way an issue would take them — first
	// expiry first — so each row says how much of it is still free.
	const left = new Map(held);
	return {
		rows: rows.map((r) => {
			const key = `${r.locationId}:${r.itemId}`;
			const quantity = Number(r.quantity);
			const hold = Math.min(quantity, left.get(key) ?? 0);
			if (hold) left.set(key, Math.round(((left.get(key) ?? 0) - hold) * 1e4) / 1e4);
			return {
				...r,
				location:
					r.locationKind === 'transit' ? m.stock_on_the_road({ location: r.location }) : r.location,
				held: hold,
				free: Math.round((quantity - hold) * 1e4) / 1e4
			};
		})
	};
};
