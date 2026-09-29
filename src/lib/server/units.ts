/**
 * Units of measure: how many base units one of an item's units is. An item counts in its base
 * unit (factor 1) and may come in packs (`item_unit`: a box of 10, a quintal of 100 kg). Every
 * conversion in the app goes through here, so a pack's factor is read the same way everywhere.
 *
 * Plain database code.
 */
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { itemUnit } from '$lib/server/db/schema';

type Reader = Pick<typeof db, 'select'>;

export type Pack = { itemId: number; uomId: number; factor: number };
type ItemRef = { id: number; baseUomId: number };

/**
 * The packs of these items. Deleted packs are left out, unless `withDeleted` — for converting a
 * line entered in a pack that has since been removed (a return of an old sale).
 */
export async function packsOf(
	reader: Reader,
	itemIds: number[],
	options: { withDeleted?: boolean } = {}
): Promise<Pack[]> {
	if (!itemIds.length) return [];
	return reader
		.select({ itemId: itemUnit.itemId, uomId: itemUnit.uomId, factor: itemUnit.factor })
		.from(itemUnit)
		.where(
			and(
				inArray(itemUnit.itemId, [...new Set(itemIds)]),
				options.withDeleted ? undefined : isNull(itemUnit.deletedAt)
			)
		);
}

/**
 * Base units in one `uomId` of the item: 1 for its base unit, the pack's factor, or undefined
 * when the item has no such unit.
 */
export function factorIn(packs: Pack[], item: ItemRef, uomId: number): number | undefined {
	if (uomId === item.baseUomId) return 1;
	return packs.find((p) => p.itemId === item.id && p.uomId === uomId)?.factor;
}

/** Loads the packs once, then answers per item and unit, as `factorIn` does. */
export async function unitFactors(
	reader: Reader,
	itemIds: number[],
	options: { withDeleted?: boolean } = {}
) {
	const packs = await packsOf(reader, itemIds, options);
	return (item: ItemRef, uomId: number) => factorIn(packs, item, uomId);
}

/** One item's factor for one unit, or null when it does not come in that unit. */
export async function unitFactor(reader: Reader, item: ItemRef, uomId: number) {
	if (uomId === item.baseUomId) return 1;
	const [pack] = await reader
		.select({ factor: itemUnit.factor })
		.from(itemUnit)
		.where(
			and(eq(itemUnit.itemId, item.id), eq(itemUnit.uomId, uomId), isNull(itemUnit.deletedAt))
		);
	return pack?.factor ?? null;
}
