import { hasPermission } from '@nahu/admin-kit/server/permissions';
import { addLocalDays, localToday } from '@nahu/admin-kit/time';
import { orgIdOf } from '$lib/server/tenant';
import { branchOptions } from '$lib/server/options';
import { datePresets } from '$lib/server/transactions';
import {
	moneyOverTime,
	movementsOverTime,
	purchasesBySupplier,
	stockValuation,
	topIssued,
	wastage,
	type ReportFilters
} from '$lib/server/reports';
import type { PageServerLoad } from './$types';

const isDay = (v: string | null): v is string => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);

export const load: PageServerLoad = async ({ locals, url }) => {
	const orgId = orgIdOf(locals);
	const today = localToday();
	const p = url.searchParams;
	let from = isDay(p.get('from')) ? p.get('from')! : addLocalDays(today, -29);
	let to = isDay(p.get('to')) ? p.get('to')! : today;
	if (from > to) [from, to] = [to, from];
	// Beyond three years the day-by-day queries stop being a report and start being a backup.
	if (from < addLocalDays(to, -1100)) from = addLocalDays(to, -1100);

	const branches = await branchOptions(orgId);
	const branchId = Number(p.get('branch')) || 0;
	const filters: ReportFilters = {
		from,
		to,
		branchId: branches.some((b) => b.value === branchId) ? branchId : 0
	};
	const seesMoney = hasPermission(locals, 'transactions.view');

	const [stock, movements, issued, suppliers, waste, money] = await Promise.all([
		stockValuation(orgId, filters.branchId),
		movementsOverTime(orgId, filters),
		topIssued(orgId, filters),
		purchasesBySupplier(orgId, filters),
		wastage(orgId, filters),
		seesMoney ? moneyOverTime(orgId, filters) : Promise.resolve(null)
	]);

	return {
		filters,
		presets: datePresets(today),
		branches,
		stock,
		movements,
		issued,
		suppliers,
		waste,
		money,
		tab: p.get('tab') ?? 'stock'
	};
};
