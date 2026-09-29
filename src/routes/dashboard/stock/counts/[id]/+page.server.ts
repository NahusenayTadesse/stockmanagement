import { fail } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { message, setError, superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { setFlash } from 'sveltekit-flash-message/server';
import { hasPermission, requirePermission } from '@nahu/admin-kit/server/permissions';
import { db } from '$lib/server/db';
import { category, location, stockCount, stockDocument, user } from '$lib/server/db/schema';
import { orgIdOf } from '$lib/server/tenant';
import { itemOptions, lotOptions } from '$lib/server/options';
import {
	addFoundLine,
	countLines,
	movedSinceOpened,
	orgCount,
	postCount,
	saveCounts
} from '$lib/server/counts';
import { ApprovalRequired, StockError } from '$lib/server/stock/post';
import { approvalState, closePendingFor, requestApproval } from '$lib/server/approvals';
import { requireBranch } from '$lib/server/scope';
import { countFound } from '$lib/schemas/counts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
	const orgId = orgIdOf(locals);
	const count = await orgCount(orgId, Number(params.id));
	await requireBranch(locals, count.branchId);
	const canPost = hasPermission(locals, 'stock.post');
	const canCount = hasPermission(locals, 'stock.draft');
	const isOpen = count.status === 'open';

	const [[names], lines, moved, items, lots, foundForm] = await Promise.all([
		db
			.select({
				location: location.name,
				category: category.name,
				openedBy: user.name,
				adjustment: stockDocument.number
			})
			.from(stockCount)
			.innerJoin(location, eq(location.id, stockCount.locationId))
			.leftJoin(category, eq(category.id, stockCount.categoryId))
			.leftJoin(user, eq(user.id, stockCount.createdBy))
			.leftJoin(stockDocument, eq(stockDocument.id, stockCount.adjustmentId))
			.where(eq(stockCount.id, count.id)),
		countLines(orgId, count.id),
		isOpen ? movedSinceOpened(orgId, count.id) : Promise.resolve(0),
		isOpen && canCount ? itemOptions(orgId) : Promise.resolve([]),
		isOpen && canCount ? lotOptions(orgId) : Promise.resolve([]),
		superValidate(zod4(countFound))
	]);
	const approval = isOpen
		? await approvalState(orgId, { kind: 'count', countId: count.id })
		: { pending: null, last: null };

	// A blind count hides what the system expects from the counters; whoever posts sees it to review.
	const showExpected = !count.blind || canPost || !isOpen;

	return {
		count,
		names,
		lines: lines.map((l) => ({
			...l,
			expected: showExpected ? l.expected : null,
			variance: showExpected ? l.variance : null,
			varianceValue: showExpected ? l.varianceValue : null
		})),
		showExpected,
		moved,
		items,
		lots: [{ value: 0, name: 'No lot' }, ...lots],
		foundForm,
		canCount,
		canPost,
		approval
	};
};

async function openCountOf(event: Parameters<Actions[string]>[0]) {
	requirePermission(event.locals, 'stock.draft');
	const orgId = orgIdOf(event.locals);
	const count = await orgCount(orgId, Number(event.params.id));
	await requireBranch(event.locals, count.branchId);
	return { orgId, count };
}

export const actions: Actions = {
	/** Every `counted_<lineId>` field on the sheet. An empty box means not counted yet. */
	save: async (event) => {
		const { orgId, count } = await openCountOf(event);
		const data = await event.request.formData();
		const entries: { lineId: number; counted: number | null }[] = [];
		for (const [key, value] of data.entries()) {
			const m = /^counted_(\d+)$/.exec(key);
			if (!m) continue;
			const text = String(value).trim();
			entries.push({ lineId: Number(m[1]), counted: text === '' ? null : Number(text) });
		}
		try {
			await db.transaction((tx) => saveCounts(tx, orgId, count.id, entries, event.locals.user?.id));
		} catch (err) {
			if (err instanceof StockError) {
				setFlash({ type: 'error', message: err.message }, event.cookies);
				return fail(400);
			}
			throw err;
		}
		setFlash({ type: 'success', message: 'Counts saved' }, event.cookies);
		return { saved: true };
	},

	addFound: async (event) => {
		const form = await superValidate(event.request, zod4(countFound));
		if (!form.valid)
			return message(form, { type: 'error', text: 'Please check the form' }, { status: 400 });
		const { orgId, count } = await openCountOf(event);
		try {
			await db.transaction((tx) =>
				addFoundLine(tx, {
					orgId,
					countId: count.id,
					itemId: form.data.itemId,
					lotId: form.data.lotId || null,
					counted: form.data.counted
				})
			);
		} catch (err) {
			if (err instanceof StockError) {
				setError(form, 'itemId', err.message);
				return message(form, { type: 'error', text: err.message }, { status: 400 });
			}
			throw err;
		}
		return message(form, { type: 'success', text: 'Added to the count' });
	},

	post: async (event) => {
		requirePermission(event.locals, 'stock.post');
		const orgId = orgIdOf(event.locals);
		const countId = Number(event.params.id);
		await requireBranch(event.locals, (await orgCount(orgId, countId)).branchId);
		try {
			const result = await db.transaction((tx) =>
				postCount(tx, { orgId, countId, userId: event.locals.user?.id })
			);
			setFlash(
				{
					type: 'success',
					message: result.number
						? `Count posted: ${result.lines} difference${result.lines === 1 ? '' : 's'} adjusted in ${result.number}`
						: 'Count posted: the shelf matched the system, nothing to adjust'
				},
				event.cookies
			);
			return { posted: true };
		} catch (err) {
			// Over the business's limit: recorded for a second person, not refused.
			if (err instanceof ApprovalRequired) {
				await requestApproval({
					orgId,
					userId: event.locals.user?.id,
					subject: { kind: 'count', countId },
					refusal: err
				});
				setFlash(
					{
						type: 'success',
						message: `Sent for approval: ${err.reason}. It is posted once someone else approves it.`
					},
					event.cookies
				);
				return { sentForApproval: true };
			}
			if (err instanceof StockError) {
				setFlash({ type: 'error', message: err.message }, event.cookies);
				return fail(409, { stockError: err.message });
			}
			throw err;
		}
	},

	cancel: async (event) => {
		requirePermission(event.locals, 'stock.post');
		const { orgId, count } = await openCountOf(event);
		if (count.status !== 'open') return fail(409);
		await closePendingFor(orgId, { kind: 'count', countId: count.id });
		await db
			.update(stockCount)
			.set({ status: 'cancelled', updatedBy: event.locals.user?.id })
			.where(eq(stockCount.id, count.id));
		setFlash({ type: 'success', message: 'Count cancelled; stock was not changed' }, event.cookies);
		return { cancelled: true };
	}
};
