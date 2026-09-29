import { localToday } from '@nahu/admin-kit/time';
import { orgIdOf } from '$lib/server/tenant';
import { branchScope } from '$lib/server/scope';
import { categoryOptions } from '$lib/server/options';
import { locationsFor, reportFilters, slowMoving } from '$lib/server/analysis';
import type { PageServerLoad } from './$types';

const days = (v: string | null, fallback: number) => {
	const n = Math.round(Number(v));
	return Number.isFinite(n) && n >= 1 && n <= 3650 ? n : fallback;
};

export const load: PageServerLoad = async ({ locals, url }) => {
	const orgId = orgIdOf(locals);
	const today = localToday();
	const scope = await branchScope(locals);
	const p = url.searchParams;
	const place = await reportFilters(orgId, scope, p, { today, days: 1 });

	const slowDays = days(p.get('slow'), 90);
	const deadDays = Math.max(days(p.get('dead'), 180), slowDays);
	const categories = await categoryOptions(orgId);
	const wantCategory = Number(p.get('category')) || 0;
	const categoryId = categories.some((c) => c.value === wantCategory) ? wantCategory : 0;

	const locationIds = await locationsFor(orgId, {
		scope,
		branchId: place.branchId,
		locationId: place.locationId
	});
	const report = await slowMoving(orgId, {
		locationIds,
		today,
		slowDays,
		deadDays,
		categoryId: categoryId || undefined
	});

	return { ...place, categories, categoryId, slowDays, deadDays, today, report };
};
