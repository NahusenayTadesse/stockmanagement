import { error, fail } from '@sveltejs/kit';
import { redirect } from 'sveltekit-flash-message/server';
import { hasPermission, requirePermission } from '@nahu/admin-kit/server/permissions';
import { db } from '$lib/server/db';
import { orgIdOf } from '$lib/server/tenant';
import { closeShift, shiftSummary } from '$lib/server/pos';
import { StockError } from '$lib/server/stock/post';
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
		error(404, 'Shift not found');
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
		try {
			await db.transaction((tx) =>
				closeShift(tx, {
					orgId,
					shiftId: summary.shift.id,
					userId: event.locals.user!.id,
					countedCash: counted,
					note: String(data.get('note') ?? '').slice(0, 255)
				})
			);
		} catch (err) {
			if (err instanceof StockError) return fail(400, { error: err.message });
			throw err;
		}
		const diff = Math.round((counted - summary.expectedCash) * 100) / 100;
		redirect(
			`/dashboard/pos/shifts/${summary.shift.id}`,
			{
				type: diff === 0 ? 'success' : 'error',
				message:
					diff === 0
						? 'Shift closed: the drawer is exact'
						: `Shift closed: the drawer is ${diff > 0 ? 'over' : 'short'} by ${Math.abs(diff).toFixed(2)}`
			},
			event.cookies
		);
	}
};
