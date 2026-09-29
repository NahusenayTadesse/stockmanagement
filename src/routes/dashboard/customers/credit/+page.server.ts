import { localToday } from '@nahu/admin-kit/time';
import { orgIdOf } from '$lib/server/tenant';
import { BUCKETS, creditSummary } from '$lib/server/credit';
import { remindOverdue } from '$lib/server/sms';
import { canText, textAction } from '$lib/server/smsActions';
import { m } from '$lib/paraglide/messages.js';
import type { Actions, PageServerLoad } from './$types';

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

	const buckets = BUCKETS.map((b) => ({ key: b.key, label: b.label }));
	return { today, rows, buckets, totals, canText: await canText(locals) };
};

export const actions: Actions = {
	/** A reminder by SMS to every active customer with something overdue and a mobile number. */
	remindAll: (event) =>
		textAction(event, m.sales_sms_what_reminders(), async (orgId) => {
			const r = await remindOverdue(orgId, event.locals.user?.id);
			if (!r.overdue) return { ok: false, status: 'skipped', error: m.sales_nobody_overdue() };
			return r.sent
				? { ok: true, status: 'sent', error: undefined }
				: {
						ok: false,
						status: 'skipped',
						error: m.sales_none_texted({ count: r.overdue })
					};
		})
};
