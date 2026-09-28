import { and, count, eq, isNull, ne } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import { WriteRefused } from '@nahu/admin-kit/server/childCrud';
import { db } from '$lib/server/db';
import {
	barcode,
	category,
	item,
	itemUnit,
	stockMovement,
	supplier,
	uom
} from '$lib/server/db/schema';
import { belongsToOrg } from '$lib/server/options';

/** The item, if it belongs to this business and is not deleted. */
export async function orgItem(orgId: number, id: number) {
	const [row] = await db
		.select()
		.from(item)
		.where(and(eq(item.id, id), eq(item.orgId, orgId), isNull(item.deletedAt)))
		.limit(1);
	return row;
}

export async function requireOrgItem(orgId: number, id: number) {
	const row = await orgItem(orgId, id);
	if (!row) error(404, 'Item not found');
	return row;
}

/** What an item is may not change once stock of it has moved: the ledger was written in its terms. */
const FIXED_ONCE_MOVED = [
	'baseUomId',
	'stockTracked',
	'trackLots',
	'trackExpiry',
	'trackSerials'
] as const;

/**
 * The server's say on an item form: the chosen category and unit are this business's, an expiry
 * date needs a lot to hang on, and the counting rules stay put once there is history.
 */
export async function checkItem(
	values: Record<string, unknown>,
	orgId: number,
	before?: Record<string, unknown>
) {
	await belongsToOrg(category, values.categoryId, orgId, 'categoryId', 'category');
	await belongsToOrg(uom, values.baseUomId, orgId, 'baseUomId', 'unit');

	if (!values.categoryId) values.categoryId = null;

	// Every stock-tracked item has a main supplier; a service is nobody's stock.
	if (!values.supplierId) {
		if (values.stockTracked !== false) {
			throw new WriteRefused(
				'supplierId',
				'Choose the main supplier. Use “New supplier” above the list if it is not there yet.'
			);
		}
		values.supplierId = null;
	} else if (Number(values.supplierId) !== Number(before?.supplierId)) {
		const [s] = await db
			.select({ id: supplier.id })
			.from(supplier)
			.where(
				and(
					eq(supplier.id, Number(values.supplierId)),
					eq(supplier.orgId, orgId),
					eq(supplier.isActive, true),
					isNull(supplier.deletedAt)
				)
			);
		if (!s) throw new WriteRefused('supplierId', 'Choose a supplier from the list.');
	}
	if (values.trackExpiry) values.trackLots = true;
	if (!values.stockTracked) {
		values.trackLots = values.trackExpiry = values.trackSerials = false;
	}

	if (before) {
		const changed = FIXED_ONCE_MOVED.filter((k) =>
			k === 'baseUomId'
				? Number(values[k]) !== Number(before[k])
				: Boolean(values[k]) !== Boolean(before[k])
		);
		if (changed.length) {
			const [{ moves }] = await db
				.select({ moves: count() })
				.from(stockMovement)
				.where(eq(stockMovement.itemId, Number(before.id)));
			if (moves > 0) {
				throw new WriteRefused(
					changed[0],
					'Stock of this item has already moved, so its base unit and its lot, expiry and serial tracking can no longer change. Create a new item instead.'
				);
			}
		}
	}
	return values;
}

/** A pack unit: this business's, not the base unit, not already on the item, and a real factor. */
export async function checkUnit(
	values: Record<string, unknown>,
	orgId: number,
	itemId: number,
	/** The row being edited, which is not its own duplicate. */
	excludeId?: unknown
) {
	const it = await requireOrgItem(orgId, itemId);
	await belongsToOrg(uom, values.uomId, orgId, 'uomId', 'unit');
	if (Number(values.uomId) === it.baseUomId) {
		throw new WriteRefused('uomId', 'That is the base unit already; add the pack sizes here.');
	}
	const [dup] = await db
		.select({ id: itemUnit.id })
		.from(itemUnit)
		.where(
			and(
				eq(itemUnit.itemId, itemId),
				eq(itemUnit.uomId, Number(values.uomId)),
				isNull(itemUnit.deletedAt),
				excludeId ? ne(itemUnit.id, Number(excludeId)) : undefined
			)
		);
	if (dup) throw new WriteRefused('uomId', 'This item already has that unit.');
	values.orgId = orgId;
	return values;
}

/** A barcode may identify only one item in a business, or scanning it would be a guess. */
export async function checkBarcode(
	values: Record<string, unknown>,
	orgId: number,
	itemId: number,
	excludeId?: unknown
) {
	await requireOrgItem(orgId, itemId);
	await belongsToOrg(uom, values.uomId, orgId, 'uomId', 'unit');
	if (!values.uomId) values.uomId = null;
	const [dup] = await db
		.select({ itemId: barcode.itemId })
		.from(barcode)
		.where(
			and(
				eq(barcode.orgId, orgId),
				eq(barcode.code, String(values.code)),
				isNull(barcode.deletedAt),
				excludeId ? ne(barcode.id, Number(excludeId)) : undefined
			)
		);
	if (dup) throw new WriteRefused('code', 'This barcode is already on an item.');
	values.orgId = orgId;
	return values;
}
