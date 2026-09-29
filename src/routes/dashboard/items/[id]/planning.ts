/**
 * The item page's planning: its minimum and maximum per location (what the reorder screen plans
 * by), and the stock currently held for proformas and requisitions. Kept apart from the page's
 * own load so the sections stay separable.
 */
import { fail, type RequestEvent } from '@sveltejs/kit';
import { and, asc, eq } from 'drizzle-orm';
import { setFlash } from 'sveltekit-flash-message/server';
import { hasPermission, requirePermission } from '@nahu/admin-kit/server/permissions';
import { localToday } from '@nahu/admin-kit/time';
import { db } from '$lib/server/db';
import { branch, item, location, reorderRule } from '$lib/server/db/schema';
import { orgIdOf } from '$lib/server/tenant';
import { requireOrgItem } from '$lib/server/items';
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
	const names = new Map((await locationOptions(orgId)).map((l) => [l.value, l.name]));
	return {
		rules: rules.filter((r) => inScope(scope, r.branchId)),
		ruleLocations: locations,
		held: held.map((h) => ({
			...h,
			location: names.get(h.locationId) ?? '—',
			for: h.quoteId
				? `Proforma ${h.quoteNumber ?? `#${h.quoteId}`}`
				: `Requisition ${h.requisitionNumber ?? `#${h.requisitionId}`}${h.department ? ` (${h.department})` : ''}`
		}))
	};
}

/** Reads a quantity box: empty is null, anything else must be a number of at least 0. */
function amount(value: FormDataEntryValue | null): number | null | undefined {
	const text = String(value ?? '').trim();
	if (text === '') return null;
	const n = Number(text);
	return Number.isFinite(n) && n >= 0 ? Math.round(n * 1e4) / 1e4 : undefined;
}

async function ruleTarget(event: RequestEvent) {
	requirePermission(event.locals, 'items.manage');
	const orgId = orgIdOf(event.locals);
	const it = await requireOrgItem(orgId, Number(event.params.id));
	return { orgId, it, data: await event.request.formData() };
}

function refuse(event: RequestEvent, text: string) {
	setFlash({ type: 'error', message: text }, event.cookies);
	return fail(400, { ruleError: text });
}

export const planningActions = {
	/** Sets the item's minimum (and maximum) at a location; one rule per location. */
	saveRule: async (event: RequestEvent) => {
		const { orgId, it, data } = await ruleTarget(event);
		const locationId = Number(data.get('locationId'));
		const min = amount(data.get('minQuantity'));
		const max = amount(data.get('maxQuantity'));
		const [loc] = await db
			.select({ id: location.id, branchId: location.branchId, kind: location.kind })
			.from(location)
			.where(and(eq(location.id, locationId), eq(location.orgId, orgId)));
		if (!loc || loc.kind === 'transit' || !inScope(await branchScope(event.locals), loc.branchId)) {
			return refuse(event, 'Choose a location from the list.');
		}
		if (min === null || min === undefined) return refuse(event, 'Enter the minimum, 0 or more.');
		if (max === undefined) return refuse(event, 'The maximum is a number, or empty.');
		if (max !== null && max < min) return refuse(event, 'The maximum cannot be below the minimum.');

		await db
			.insert(reorderRule)
			.values({ orgId, itemId: it.id, locationId: loc.id, minQuantity: min, maxQuantity: max })
			.onDuplicateKeyUpdate({ set: { minQuantity: min, maxQuantity: max } });
		setFlash({ type: 'success', message: 'Reorder levels saved' }, event.cookies);
		return { saved: true };
	},

	deleteRule: async (event: RequestEvent) => {
		const { orgId, it, data } = await ruleTarget(event);
		await db
			.delete(reorderRule)
			.where(
				and(
					eq(reorderRule.id, Number(data.get('id'))),
					eq(reorderRule.orgId, orgId),
					eq(reorderRule.itemId, it.id)
				)
			);
		setFlash({ type: 'success', message: 'Reorder levels removed' }, event.cookies);
		return { deleted: true };
	}
};
