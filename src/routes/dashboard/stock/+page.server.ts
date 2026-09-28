import { orgIdOf } from '$lib/server/tenant';
import { onHandRows } from '$lib/server/stock/queries';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => ({
	rows: await onHandRows(orgIdOf(locals))
});
