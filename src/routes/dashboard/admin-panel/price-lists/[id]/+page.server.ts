import { error } from '@sveltejs/kit';
import { and, eq, isNull } from 'drizzle-orm';
import { childActions, childCrud, WriteRefused } from '@nahu/admin-kit/server/childCrud';
import { db } from '$lib/server/db';
import { item, itemUnit, priceList, priceListItem } from '$lib/server/db/schema';
import { orgIdOf } from '$lib/server/tenant';
import { itemOptions, unitOptions } from '$lib/server/options';
import { itemAdd, itemEdit } from '../schema';
import type { Actions, PageServerLoad, RequestEvent } from './$types';

async function orgList(orgId: number, id: number) {
	const [row] = await db
		.select()
		.from(priceList)
		.where(and(eq(priceList.id, id), eq(priceList.orgId, orgId), isNull(priceList.deletedAt)));
	if (!row) error(404, 'Price list not found');
	return row;
}

const prices = childCrud({
	table: priceListItem,
	ownerColumn: 'priceListId',
	label: 'Price',
	addSchema: itemAdd,
	editSchema: itemEdit,
	permission: 'settings.manage',
	transform: async (values, event) => {
		const orgId = orgIdOf(event.locals);
		const [it] = await db
			.select()
			.from(item)
			.where(
				and(eq(item.id, Number(values.itemId)), eq(item.orgId, orgId), isNull(item.deletedAt))
			);
		if (!it) throw new WriteRefused('itemId', 'Choose an item from the list.');
		const uomId = Number(values.uomId) || null;
		if (uomId && uomId !== it.baseUomId) {
			const [u] = await db
				.select({ id: itemUnit.id })
				.from(itemUnit)
				.where(
					and(eq(itemUnit.itemId, it.id), eq(itemUnit.uomId, uomId), isNull(itemUnit.deletedAt))
				);
			if (!u) throw new WriteRefused('uomId', `${it.name} has no conversion for this unit.`);
		}
		return { ...values, orgId, uomId: uomId === it.baseUomId ? null : uomId };
	}
});

export const load: PageServerLoad = async ({ params, locals }) => {
	const orgId = orgIdOf(locals);
	const list = await orgList(orgId, Number(params.id));
	const [section, items, units] = await Promise.all([
		prices.load(list.id),
		itemOptions(orgId),
		unitOptions(orgId)
	]);
	const itemName = new Map(items.map((i) => [i.value, i.name]));
	const unitName = new Map(units.map((u) => [u.value, u.name]));
	return {
		list,
		prices: {
			...section,
			rows: (section.rows as (typeof priceListItem.$inferSelect)[]).map((r) => ({
				...r,
				uomId: r.uomId ?? 0,
				item: itemName.get(r.itemId) ?? '—',
				unit: r.uomId ? (unitName.get(r.uomId) ?? '—') : 'Base unit'
			}))
		},
		items,
		units: [{ value: 0, name: 'Base unit' }, ...units]
	};
};

export const actions: Actions = {
	...childActions({ Price: prices }, async (event: RequestEvent) => {
		const list = await orgList(orgIdOf(event.locals), Number(event.params.id));
		return list.id;
	})
};
