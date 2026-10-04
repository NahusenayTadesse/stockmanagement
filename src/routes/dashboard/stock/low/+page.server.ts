import { db } from '$lib/server/db';
import { orgIdOf } from '$lib/server/tenant';
import { viewScope } from '$lib/server/scope';
import { dashboardStats } from '$lib/server/stock/queries';
export const load = async ({ locals, url }) => {
	const page = Math.max(1, Math.min(100_000, Math.floor(Number(url.searchParams.get('page')) || 1)));
	const stats = await dashboardStats(orgIdOf(locals), await viewScope(locals, url), db, { limit: 50, offset: (page - 1) * 50 });
	return { rows: stats.lowStock, total: stats.lowStockCount, page };
};
