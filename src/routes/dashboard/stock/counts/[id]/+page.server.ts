import { m } from '$lib/paraglide/messages.js';
import { fail } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
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
import { ApprovalRequired } from '$lib/server/stock/post';
import { attempt, attemptForm, flashDone, invalidForm } from '$lib/server/actions';
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
		lots: [{ value: 0, name: m.stock_no_lot() }, ...lots],
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
		return attempt(
			event,
			async () => {
				await db.transaction((tx) =>
					saveCounts(tx, orgId, count.id, entries, event.locals.user?.id)
				);
				return m.stock_counts_saved();
			},
			{ status: 400 }
		);
	},

	addFound: async (event) => {
		const form = await superValidate(event.request, zod4(countFound));
		if (!form.valid) return invalidForm(form);
		const { orgId, count } = await openCountOf(event);
		return attemptForm(
			form,
			async () => {
				await db.transaction((tx) =>
					addFoundLine(tx, {
						orgId,
						countId: count.id,
						itemId: form.data.itemId,
						lotId: form.data.lotId || null,
						counted: form.data.counted
					})
				);
				return m.stock_added_to_count();
			},
			{ field: 'itemId' }
		);
	},

	post: async (event) => {
		requirePermission(event.locals, 'stock.post');
		const orgId = orgIdOf(event.locals);
		const countId = Number(event.params.id);
		await requireBranch(event.locals, (await orgCount(orgId, countId)).branchId);
		return attempt(event, async () => {
			try {
				const result = await db.transaction((tx) =>
					postCount(tx, { orgId, countId, userId: event.locals.user?.id })
				);
				return result.number
					? result.lines === 1
						? m.stock_count_posted_one({ number: result.number })
						: m.stock_count_posted_many({ count: result.lines, number: result.number })
					: m.stock_count_posted_none();
			} catch (err) {
				// Over the business's limit: recorded for a second person, not refused.
				if (!(err instanceof ApprovalRequired)) throw err;
				await requestApproval({
					orgId,
					userId: event.locals.user?.id,
					subject: { kind: 'count', countId },
					refusal: err
				});
				return m.stock_count_sent_for_approval({ reason: err.reason });
			}
		});
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
		flashDone(event, m.stock_count_cancelled());
		return { done: true };
	}
};
