/**
 * What an item sells for: the customer's price list when it names the item (in that unit, or in
 * the base unit scaled up), otherwise the item's list price for the unit. Before VAT, always.
 *
 * Plain database code: the till, proformas and the seed all use it.
 */
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { customer, item, itemUnit, priceListItem } from '$lib/server/db/schema';

type Reader = Pick<typeof db, 'select'>;

const cents = (n: number) => Math.round(n * 100) / 100;

/** The price list a customer buys on, if any. */
export async function priceListOf(orgId: number, customerId: number | null, reader: Reader = db) {
	if (!customerId) return null;
	const [c] = await reader
		.select({ priceListId: customer.priceListId })
		.from(customer)
		.where(and(eq(customer.id, customerId), eq(customer.orgId, orgId)));
	return c?.priceListId ?? null;
}

/**
 * Prices for many items at once, by `itemId:uomId`, for every unit each item sells in. What the
 * till and the proforma editor load, so a customer change reprices without a round trip per line.
 */
export async function priceTable(
	orgId: number,
	itemIds: number[],
	priceListId: number | null,
	reader: Reader = db
) {
	if (!itemIds.length) return new Map<string, number | null>();
	const [items, units, listed] = await Promise.all([
		reader
			.select({ id: item.id, baseUomId: item.baseUomId, salePrice: item.salePrice })
			.from(item)
			.where(and(eq(item.orgId, orgId), inArray(item.id, itemIds))),
		reader
			.select({ itemId: itemUnit.itemId, uomId: itemUnit.uomId, factor: itemUnit.factor })
			.from(itemUnit)
			.where(and(inArray(itemUnit.itemId, itemIds), isNull(itemUnit.deletedAt))),
		priceListId
			? reader
					.select({
						itemId: priceListItem.itemId,
						uomId: priceListItem.uomId,
						price: priceListItem.price
					})
					.from(priceListItem)
					.where(
						and(
							eq(priceListItem.priceListId, priceListId),
							eq(priceListItem.orgId, orgId),
							inArray(priceListItem.itemId, itemIds),
							isNull(priceListItem.deletedAt)
						)
					)
			: Promise.resolve([])
	]);

	const out = new Map<string, number | null>();
	for (const it of items) {
		const unitList = [
			{ uomId: it.baseUomId, factor: 1 },
			...units.filter((u) => u.itemId === it.id && u.uomId !== it.baseUomId)
		];
		const onList = listed.filter((l) => l.itemId === it.id);
		const baseOnList = onList.find((l) => (l.uomId ?? it.baseUomId) === it.baseUomId);
		for (const u of unitList) {
			const exact = onList.find((l) => (l.uomId ?? it.baseUomId) === u.uomId);
			const price = exact
				? exact.price
				: baseOnList
					? cents(baseOnList.price * u.factor)
					: it.salePrice !== null
						? cents(it.salePrice * u.factor)
						: null;
			out.set(`${it.id}:${u.uomId}`, price);
		}
	}
	return out;
}

/** One item's price in one unit for a customer (or nobody), or null when it has none. */
export async function priceFor(
	orgId: number,
	input: { itemId: number; uomId: number; customerId: number | null },
	reader: Reader = db
) {
	const listId = await priceListOf(orgId, input.customerId, reader);
	const table = await priceTable(orgId, [input.itemId], listId, reader);
	return table.get(`${input.itemId}:${input.uomId}`) ?? null;
}

/** Percent off the list price, rounded to one decimal; 0 when there is no discount. */
export function discountPercent(listPrice: number | null, unitPrice: number) {
	if (!listPrice || unitPrice >= listPrice) return 0;
	return Math.round((1 - unitPrice / listPrice) * 1000) / 10;
}
