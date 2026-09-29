import { localToday } from '@nahu/admin-kit/time';
import { orgIdOf } from '$lib/server/tenant';
import { branchScope } from '$lib/server/scope';
import {
	daysBetween,
	locationsFor,
	reportFilters,
	stockTrend,
	trendItems,
	type Grain
} from '$lib/server/analysis';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	const orgId = orgIdOf(locals);
	const today = localToday();
	const scope = await branchScope(locals);
	const p = url.searchParams;
	const place = await reportFilters(orgId, scope, p, { today, days: 90 });

	const items = await trendItems(orgId);
	const wanted = Number(p.get('item')) || 0;
	const itemId = items.some((i) => i.value === wanted) ? wanted : 0;

	// Days for a couple of months, weeks up to about half a year, Ethiopian months beyond.
	const span = daysBetween(place.from, place.to);
	const asked = p.get('grain');
	const grain: Grain =
		asked === 'day' || asked === 'week' || asked === 'month'
			? asked
			: span <= 62
				? 'day'
				: span <= 200
					? 'week'
					: 'month';

	const trend = itemId
		? await stockTrend(orgId, {
				itemId,
				locationIds: await locationsFor(orgId, {
					scope,
					branchId: place.branchId,
					locationId: place.locationId
				}),
				locationId: place.locationId || undefined,
				from: place.from,
				to: place.to,
				grain
			})
		: null;

	return { ...place, items, itemId, grain, trend };
};
