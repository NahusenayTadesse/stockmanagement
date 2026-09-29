import { fail } from '@sveltejs/kit';
import { redirect } from 'sveltekit-flash-message/server';
import { auth } from '$lib/server/auth';
import { orgIdOf } from '$lib/server/tenant';
import { hasPermission } from '@nahu/admin-kit/server/permissions';
import { dashboardStats } from '$lib/server/stock/queries';
import { localToday } from '@nahu/admin-kit/time';
import { datePresets, transactionTotals } from '$lib/server/transactions';
import { sellsToCustomers } from '$lib/server/customers';
import { creditSummary } from '$lib/server/credit';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const orgId = orgIdOf(locals);

	// This Ethiopian month's money, for whoever may see transactions.
	let money = null;
	if (hasPermission(locals, 'transactions.view')) {
		const month = datePresets(localToday()).find((p) => p.key === 'month')!;
		money = {
			from: month.from,
			to: month.to,
			...(await transactionTotals(orgId, {
				from: month.from,
				to: month.to,
				direction: '',
				status: '',
				purpose: '',
				methodId: 0,
				branchId: 0,
				q: ''
			}))
		};
	}

	// The home page is open to every signed-in user; the stock figures are not.
	const stats = hasPermission(locals, 'stock.view') ? await dashboardStats(orgId) : null;
	// Credit (ዱቤ): what customers owe, for a business that sells and a viewer who sees customers.
	let credit = null;
	if (hasPermission(locals, 'customers.view') && (await sellsToCustomers(orgId))) {
		const all = await creditSummary(orgId);
		credit = {
			owed: all.reduce((s, c) => s + Math.max(0, c.balance), 0),
			debtors: all.filter((c) => c.balance > 0).length,
			overdue: all.reduce((s, c) => s + c.overdue, 0),
			overLimit: all.filter((c) => c.overLimit).length
		};
	}
	return { stats, money, credit };
};

export const actions: Actions = {
	logout: async (event) => {
		if (!event.locals.session) return fail(401);
		await auth.api.signOut({ headers: event.request.headers });
		redirect('/login', { type: 'success', message: 'Signed out' }, event.cookies);
	}
};
