import { error } from '@sveltejs/kit';
import { redirect } from 'sveltekit-flash-message/server';
import { hasPermission, requirePermission } from '@nahu/admin-kit/server/permissions';
import { db } from '$lib/server/db';
import { orgIdOf } from '$lib/server/tenant';
import { closeShift, shiftSummary } from '$lib/server/pos';
import { attempt } from '$lib/server/actions';
import { cents } from '$lib/money';
import { m } from '$lib/paraglide/messages.js';
import type { Actions, PageServerLoad } from './$types';

async function allowed(locals: App.Locals, shiftUserId: string) {
	if (shiftUserId !== locals.user!.id && !hasPermission(locals, 'pos.manage')) {
		error(403, "That is someone else's shift.");
	}
}

export const load: PageServerLoad = async ({ params, locals }) => {
	const orgId = orgIdOf(locals);
	let summary;
	try {
		summary = await shiftSummary(orgId, Number(params.id));
	} catch {
		error(404, m.sales_shift_not_found());
	}
	await allowed(locals, summary.shift.userId);
	return { summary };
};

export const actions: Actions = {
	/** Counts the drawer and closes the shift. */
	close: async (event) => {
		requirePermission(event.locals, 'pos.use');
		const orgId = orgIdOf(event.locals);
		const summary = await shiftSummary(orgId, Number(event.params.id));
		await allowed(event.locals, summary.shift.userId);
		const data = await event.request.formData();
		const counted = Number(data.get('countedCash'));
		const closed = await attempt(
			event,
			async () => {
				await db.transaction((tx) =>
					closeShift(tx, {
						orgId,
						shiftId: summary.shift.id,
						userId: event.locals.user!.id,
						countedCash: counted,
						note: String(data.get('note') ?? '').slice(0, 255)
					})
				);
				return null;
			},
			{ status: 400 }
		);
		if (!('done' in closed)) return closed;
		const diff = cents(counted - summary.expectedCash);
		redirect(
			`/dashboard/pos/shifts/${summary.shift.id}`,
			{
				type: diff === 0 ? 'success' : 'error',
				message:
					diff === 0
						? m.sales_shift_closed_exact()
						: diff > 0
							? m.sales_shift_closed_over({ amount: Math.abs(diff).toFixed(2) })
							: m.sales_shift_closed_short({ amount: Math.abs(diff).toFixed(2) })
			},
			event.cookies
		);
	}
};
