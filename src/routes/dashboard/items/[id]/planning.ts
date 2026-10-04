/**
 * The item page's planning: its minimum and maximum per location (what the reorder screen plans
 * by), and the stock currently held for proformas and requisitions. Kept apart from the page's
 * own load so the sections stay separable.
 */
import { m } from '$lib/paraglide/messages.js';
import type { RequestEvent } from '@sveltejs/kit';
import { and, asc, eq } from 'drizzle-orm';
import { WriteRefused } from '@nahu/admin-kit/server/childCrud';
import { hasPermission, requirePermission } from '@nahu/admin-kit/server/permissions';
import { localToday } from '@nahu/admin-kit/time';
import { db } from '$lib/server/db';
import { branch, item, location, reorderRule } from '$lib/server/db/schema';
import { orgIdOf } from '$lib/server/tenant';
import { requireOrgItem } from '$lib/server/items';
import { round4 } from '$lib/money';
import { attempt, flashDone } from '$lib/server/actions';
import { locationOptions } from '$lib/server/options';
import { reservationsOfItem } from '$lib/server/reservations';
import { branchScope, inScope } from '$lib/server/scope';

type Item = typeof item.$inferSelect;

export async function planningSection(orgId: number, it: Item, locals: App.Locals) {
	if (!it.stockTracked) return { rules: [], ruleLocations: [], held: [] };
	const scope = await branchScope(locals);
	const [rules, locations, held] = await Promise.all([
		db
			.select({
				id: reorderRule.id,
				locationId: reorderRule.locationId,
				location: location.name,
				branchId: location.branchId,
				branch: branch.name,
				minQuantity: reorderRule.minQuantity,
				maxQuantity: reorderRule.maxQuantity
			})
			.from(reorderRule)
			.innerJoin(location, eq(location.id, reorderRule.locationId))
			.innerJoin(branch, eq(branch.id, location.branchId))
			.where(and(eq(reorderRule.orgId, orgId), eq(reorderRule.itemId, it.id)))
			.orderBy(asc(branch.name), asc(location.name)),
		hasPermission(locals, 'items.manage') ? locationOptions(orgId, scope) : Promise.resolve([]),
		reservationsOfItem(orgId, it.id, localToday())
	]);
	const names = new Map((await locationOptions(orgId, scope)).map((l) => [l.value, l.name]));
	return {
		rules: rules.filter((r) => inScope(scope, r.branchId)),
		ruleLocations: locations,
		held: held.filter((h) => names.has(h.locationId)).map((h) => ({
			...h,
			location: names.get(h.locationId) ?? '—',
			for: h.quoteId
				? m.stock_held_proforma({ number: h.quoteNumber ?? `#${h.quoteId}` })
				: m.stock_held_requisition({
						number: h.requisitionNumber ?? `#${h.requisitionId}`
					}) + (h.department ? ` (${h.department})` : '')
		}))
	};
}

/** Reads a quantity box: empty is null, anything else must be a number of at least 0. */
function amount(value: FormDataEntryValue | null): number | null | undefined {
	const text = String(value ?? '').trim();
	if (text === '') return null;
	const n = Number(text);
	return Number.isFinite(n) && n >= 0 ? round4(n) : undefined;
}

async function ruleTarget(event: RequestEvent) {
	requirePermission(event.locals, 'items.manage');
	const orgId = orgIdOf(event.locals);
	const it = await requireOrgItem(orgId, Number(event.params.id));
	return { orgId, it, data: await event.request.formData() };
}

export const planningActions = {
	/** Sets the item's minimum (and maximum) at a location; one rule per location. */
	saveRule: async (event: RequestEvent) => {
		const { orgId, it, data } = await ruleTarget(event);
		const locationId = Number(data.get('locationId'));
		const min = amount(data.get('minQuantity'));
		const max = amount(data.get('maxQuantity'));
		return attempt(
			event,
			async () => {
				const [loc] = await db
					.select({ id: location.id, branchId: location.branchId, kind: location.kind })
					.from(location)
					.where(and(eq(location.id, locationId), eq(location.orgId, orgId)));
				if (
					!loc ||
					loc.kind === 'transit' ||
					!inScope(await branchScope(event.locals), loc.branchId)
				) {
					throw new WriteRefused('locationId', m.stock_err_location_list());
				}
				if (min === null || min === undefined)
					throw new WriteRefused('minQuantity', m.stock_err_min());
				if (max === undefined) throw new WriteRefused('maxQuantity', m.stock_err_max_number());
				if (max !== null && max < min) {
					throw new WriteRefused('maxQuantity', m.stock_err_max_below_min());
				}

				await db
					.insert(reorderRule)
					.values({ orgId, itemId: it.id, locationId: loc.id, minQuantity: min, maxQuantity: max })
					.onDuplicateKeyUpdate({ set: { minQuantity: min, maxQuantity: max } });
				return m.stock_reorder_saved();
			},
			{ status: 400 }
		);
	},

	deleteRule: async (event: RequestEvent) => {
		const { orgId, it, data } = await ruleTarget(event);
		const allowed = await locationOptions(orgId, await branchScope(event.locals));
		const [rule] = await db.select().from(reorderRule).where(and(eq(reorderRule.id, Number(data.get('id'))), eq(reorderRule.orgId, orgId)));
		if (!rule || !allowed.some((l) => l.value === rule.locationId)) throw new WriteRefused('id', m.admin_scope_not_found());
		await db
			.delete(reorderRule)
			.where(
				and(
					eq(reorderRule.id, Number(data.get('id'))),
					eq(reorderRule.orgId, orgId),
					eq(reorderRule.itemId, it.id)
				)
			);
		flashDone(event, m.stock_reorder_removed());
		return { done: true };
	}
};
