import { localToday } from '@nahu/admin-kit/time';
import { orgIdOf } from '$lib/server/tenant';
import { BUCKETS, creditSummary } from '$lib/server/credit';
import type { PageServerLoad } from './$types';

/** Who owes what, and for how long: receivables by age. */
export const load: PageServerLoad = async ({ locals }) => {
	const today = localToday();
	const all = await creditSummary(orgIdOf(locals), today);
	const rows = all
		.filter((c) => c.balance !== 0 || c.open.length)
		.map(({ open, buckets, ...c }) => ({ ...c, ...buckets, openSales: open.length }))
		.sort((a, b) => b.overdue - a.overdue || b.balance - a.balance);

	const totals = Object.fromEntries(
		BUCKETS.map((b) => [b.key, rows.reduce((s, r) => s + Math.max(0, r[b.key]), 0)])
	) as Record<(typeof BUCKETS)[number]['key'], number>;

	return { today, rows, buckets: BUCKETS, totals };
};
