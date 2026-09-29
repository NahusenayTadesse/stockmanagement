import { localToday } from '@nahu/admin-kit/time';
import { orgIdOf } from '$lib/server/tenant';
import { branchScope } from '$lib/server/scope';
import { serialLookup } from '$lib/server/analysis';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	const orgId = orgIdOf(locals);
	const today = localToday();
	const q = (url.searchParams.get('q') ?? '').trim().slice(0, 80);
	const units = q ? await serialLookup(orgId, { q, today, scope: await branchScope(locals) }) : [];
	return { q, today, units };
};
