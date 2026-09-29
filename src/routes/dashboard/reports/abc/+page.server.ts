import { localToday } from '@nahu/admin-kit/time';
import { orgIdOf } from '$lib/server/tenant';
import { branchScope } from '$lib/server/scope';
import { sellsToCustomers } from '$lib/server/customers';
import { abcAnalysis, locationsFor, reportFilters, type AbcBasis } from '$lib/server/analysis';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	const orgId = orgIdOf(locals);
	const today = localToday();
	const scope = await branchScope(locals);
	const place = await reportFilters(orgId, scope, url.searchParams, { today, days: 365 });
	// An internal store sells nothing: its ABC is by what is used.
	const sells = await sellsToCustomers(orgId);
	const basis: AbcBasis = sells && url.searchParams.get('basis') === 'revenue' ? 'revenue' : 'cost';

	const locationIds = await locationsFor(orgId, {
		scope,
		branchId: place.branchId,
		locationId: place.locationId
	});
	const report = await abcAnalysis(orgId, { locationIds, from: place.from, to: place.to, basis });
	return { ...place, basis, sells, report };
};
