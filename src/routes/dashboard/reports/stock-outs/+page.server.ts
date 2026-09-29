import { localToday } from '@nahu/admin-kit/time';
import { orgIdOf } from '$lib/server/tenant';
import { branchScope } from '$lib/server/scope';
import { locationsFor, reportFilters, stockOuts } from '$lib/server/analysis';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	const orgId = orgIdOf(locals);
	const today = localToday();
	const scope = await branchScope(locals);
	const place = await reportFilters(orgId, scope, url.searchParams, { today, days: 90 });
	const byLocation = url.searchParams.get('by') === 'location';

	// Shelves only: stock in transit or quarantine neither fills a shelf nor empties it.
	const locationIds = await locationsFor(orgId, {
		scope,
		branchId: place.branchId,
		locationId: place.locationId,
		shelvesOnly: true
	});
	const report = await stockOuts(orgId, {
		locationIds,
		from: place.from,
		to: place.to,
		today,
		byLocation
	});
	return { ...place, byLocation, report };
};
