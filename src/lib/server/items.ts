import { m } from '$lib/paraglide/messages.js';
import { and, asc, count, eq, inArray, isNull, ne, sql } from 'drizzle-orm';

import { WriteRefused } from '@nahu/admin-kit/server/childCrud';
import { db } from '$lib/server/db';
import {
	barcode,
	category,
	item,
	itemUnit,
	kitComponent,
	stockBalance,
	stockMovement,
	supplier,
	uom
} from '$lib/server/db/schema';
import { belongsToOrg } from '$lib/server/options';
import { cents } from '$lib/money';
import { packsOf, unitFactor } from '$lib/server/units';
import { orgRow, orgRowOr404 } from '$lib/server/org';

/** The item, if it belongs to this business and is not deleted. */
export async function orgItem(orgId: number, id: number) {
	return orgRow(item, orgId, id);
}

export async function requireOrgItem(orgId: number, id: number) {
	return orgRowOr404(item, orgId, id, m.stock_item_not_found);
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
	// A kit or recipe is its components: it is never counted in stock itself, so it needs no
	// supplier either.
	if (values.isKit) values.stockTracked = false;

	// Every stock-tracked item has a main supplier; a service is nobody's stock.
	if (!values.supplierId) {
		if (values.stockTracked !== false) {
			throw new WriteRefused('supplierId', m.stock_err_main_supplier());
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
		if (!s) throw new WriteRefused('supplierId', m.stock_err_supplier_list());
	}
	if (values.trackExpiry) values.trackLots = true;
	if (!values.stockTracked) {
		values.trackLots = values.trackExpiry = values.trackSerials = false;
	}

	await checkVariant(values, orgId, before);
	values.warrantyMonths = values.warrantyMonths ?? null;
	values.weightKg = values.weightKg ?? null;

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
				throw new WriteRefused(changed[0], m.stock_err_item_moved());
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
		throw new WriteRefused('uomId', m.stock_err_already_base());
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
	if (dup) throw new WriteRefused('uomId', m.stock_err_unit_exists());
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
	if (dup) throw new WriteRefused('code', m.stock_err_barcode_taken());
	values.orgId = orgId;
	return values;
}

/**
 * A variant hangs under one parent, one level deep: the parent is this business's, not the item
 * itself, not a variant, and an item with variants of its own cannot become one.
 */
async function checkVariant(
	values: Record<string, unknown>,
	orgId: number,
	before?: Record<string, unknown>
) {
	const parentId = Number(values.parentItemId) || null;
	values.parentItemId = parentId;
	values.variantLabel = String(values.variantLabel ?? '').trim() || null;
	if (!parentId) {
		values.variantLabel = null;
		return;
	}
	if (before && Number(before.id) === parentId) {
		throw new WriteRefused('parentItemId', m.stock_err_variant_self());
	}
	const parent = await orgItem(orgId, parentId);
	if (!parent) throw new WriteRefused('parentItemId', m.stock_err_item_list());
	if (parent.parentItemId) {
		throw new WriteRefused('parentItemId', m.stock_err_parent_is_variant({ item: parent.name }));
	}
	if (before) {
		const [child] = await db
			.select({ id: item.id })
			.from(item)
			.where(and(eq(item.parentItemId, Number(before.id)), isNull(item.deletedAt)))
			.limit(1);
		if (child) {
			throw new WriteRefused('parentItemId', m.stock_err_has_variants());
		}
	}
	if (!values.variantLabel) {
		throw new WriteRefused('variantLabel', m.stock_err_variant_label());
	}
}

/**
 * A component of a kit or recipe: this business's item, not the kit, not another kit, not
 * tracked by serial number (a kit cannot say which unit it took), in its base unit or one of its
 * packs.
 */
export async function checkComponent(
	values: Record<string, unknown>,
	orgId: number,
	kitId: number,
	excludeId?: unknown
) {
	const kit = await requireOrgItem(orgId, kitId);
	if (!kit.isKit) {
		throw new WriteRefused('componentItemId', m.stock_err_mark_kit());
	}
	const comp = await orgItem(orgId, Number(values.componentItemId));
	if (!comp) throw new WriteRefused('componentItemId', m.stock_err_item_list());
	if (comp.id === kit.id) throw new WriteRefused('componentItemId', m.stock_err_kit_self());
	if (comp.isKit) {
		throw new WriteRefused('componentItemId', m.stock_err_component_is_kit({ item: comp.name }));
	}
	if (comp.trackSerials) {
		throw new WriteRefused(
			'componentItemId',
			m.stock_err_component_serial_kit({ item: comp.name })
		);
	}
	const uomId = Number(values.uomId) || comp.baseUomId;
	if ((await unitFactor(db, comp, uomId)) === null) {
		throw new WriteRefused('uomId', m.stock_err_component_no_unit({ item: comp.name }));
	}
	const [dup] = await db
		.select({ id: kitComponent.id })
		.from(kitComponent)
		.where(
			and(
				eq(kitComponent.kitItemId, kit.id),
				eq(kitComponent.componentItemId, comp.id),
				isNull(kitComponent.deletedAt),
				excludeId ? ne(kitComponent.id, Number(excludeId)) : undefined
			)
		);
	if (dup)
		throw new WriteRefused('componentItemId', m.stock_err_component_dup({ item: comp.name }));
	values.uomId = uomId;
	values.orgId = orgId;
	return values;
}

/**
 * A kit's components with what they cost (at average cost), and how many kits the stock on hand
 * could make — everywhere, or at one location.
 */
export async function kitComponents(orgId: number, kitId: number, locationId?: number) {
	const rows = await db
		.select({
			id: kitComponent.id,
			componentItemId: kitComponent.componentItemId,
			uomId: kitComponent.uomId,
			quantity: kitComponent.quantity,
			item: item.name,
			sku: item.sku,
			baseUomId: item.baseUomId,
			stockTracked: item.stockTracked,
			avgCost: item.avgCost,
			unit: uom.symbol
		})
		.from(kitComponent)
		.innerJoin(item, eq(item.id, kitComponent.componentItemId))
		.innerJoin(uom, eq(uom.id, kitComponent.uomId))
		.where(
			and(
				eq(kitComponent.orgId, orgId),
				eq(kitComponent.kitItemId, kitId),
				isNull(kitComponent.deletedAt)
			)
		)
		.orderBy(asc(kitComponent.id));
	const factors = await packFactors(rows.map((r) => r.componentItemId));
	const onHand = await onHandOf(
		orgId,
		rows.map((r) => r.componentItemId),
		locationId
	);
	return rows.map((r) => {
		const factor =
			r.uomId === r.baseUomId ? 1 : (factors.get(`${r.componentItemId}:${r.uomId}`) ?? 1);
		const base = r.quantity * factor;
		const have = onHand.get(r.componentItemId) ?? 0;
		return {
			...r,
			base,
			cost: cents(base * r.avgCost),
			onHand: have,
			/** How many kits this component alone allows; services never limit. */
			makes: r.stockTracked ? Math.floor(have / base + 1e-9) : null
		};
	});
}

/** How many of each kit the stock on hand could make, for the till. */
export async function kitsAvailable(orgId: number, kitIds: number[], locationId?: number) {
	const out = new Map<number, number>();
	if (!kitIds.length) return out;
	const rows = await db
		.select({
			kitItemId: kitComponent.kitItemId,
			componentItemId: kitComponent.componentItemId,
			uomId: kitComponent.uomId,
			quantity: kitComponent.quantity,
			baseUomId: item.baseUomId,
			stockTracked: item.stockTracked
		})
		.from(kitComponent)
		.innerJoin(item, eq(item.id, kitComponent.componentItemId))
		.where(
			and(
				eq(kitComponent.orgId, orgId),
				inArray(kitComponent.kitItemId, kitIds),
				isNull(kitComponent.deletedAt)
			)
		);
	const ids = [...new Set(rows.map((r) => r.componentItemId))];
	const [factors, onHand] = await Promise.all([packFactors(ids), onHandOf(orgId, ids, locationId)]);
	for (const kitId of kitIds) {
		const parts = rows.filter((r) => r.kitItemId === kitId && r.stockTracked);
		const all = rows.filter((r) => r.kitItemId === kitId);
		if (!all.length) {
			out.set(kitId, 0);
			continue;
		}
		let makes = Infinity;
		for (const p of parts) {
			const factor =
				p.uomId === p.baseUomId ? 1 : (factors.get(`${p.componentItemId}:${p.uomId}`) ?? 1);
			makes = Math.min(
				makes,
				Math.floor((onHand.get(p.componentItemId) ?? 0) / (p.quantity * factor) + 1e-9)
			);
		}
		out.set(kitId, makes === Infinity ? -1 : Math.max(0, makes));
	}
	return out;
}

/** The packs of these items, keyed `itemId:uomId`, for the kit screens' component lists. */
async function packFactors(itemIds: number[]) {
	const rows = await packsOf(db, itemIds);
	return new Map(rows.map((r) => [`${r.itemId}:${r.uomId}`, r.factor]));
}

async function onHandOf(orgId: number, itemIds: number[], locationId?: number) {
	const out = new Map<number, number>();
	if (!itemIds.length) return out;
	const rows = await db
		.select({ itemId: stockBalance.itemId, quantity: sql<number>`SUM(${stockBalance.quantity})` })
		.from(stockBalance)
		.where(
			and(
				eq(stockBalance.orgId, orgId),
				inArray(stockBalance.itemId, itemIds),
				locationId ? eq(stockBalance.locationId, locationId) : undefined
			)
		)
		.groupBy(stockBalance.itemId);
	for (const r of rows) out.set(r.itemId, Number(r.quantity));
	return out;
}

/**
 * A new variant of an item: a copy of its settings (unit, category, supplier, tracking, tax,
 * pack units) under its own code and label, with its own price and barcode when given. Returns
 * the new item's id.
 */
export async function createVariant(
	orgId: number,
	parentId: number,
	input: { variantLabel: string; sku: string; salePrice: number | null; barcode: string },
	userId?: string
) {
	const parent = await requireOrgItem(orgId, parentId);
	if (parent.parentItemId) {
		throw new WriteRefused('variantLabel', m.stock_err_variant_of_variant());
	}
	const [skuTaken] = await db
		.select({ id: item.id })
		.from(item)
		.where(and(eq(item.orgId, orgId), eq(item.sku, input.sku)));
	if (skuTaken) throw new WriteRefused('sku', m.stock_err_sku_taken());
	if (input.barcode) await checkBarcode({ code: input.barcode, uomId: 0 }, orgId, parent.id);

	return db.transaction(async (tx) => {
		// Everything that describes the item; not its identity, history or cost, which are its own.
		const settings: Partial<typeof parent> = { ...parent };
		for (const k of [
			'id',
			'createdAt',
			'updatedAt',
			'deletedAt',
			'deletedBy',
			'avgCost'
		] as const) {
			delete settings[k];
		}
		const [created] = await tx
			.insert(item)
			.values({
				...(settings as typeof item.$inferInsert),
				sku: input.sku,
				parentItemId: parent.id,
				variantLabel: input.variantLabel,
				salePrice: input.salePrice ?? parent.salePrice,
				createdBy: userId ?? null,
				updatedBy: userId ?? null
			})
			.$returningId();
		const packs = await tx
			.select({ uomId: itemUnit.uomId, factor: itemUnit.factor })
			.from(itemUnit)
			.where(and(eq(itemUnit.itemId, parent.id), isNull(itemUnit.deletedAt)));
		if (packs.length) {
			await tx
				.insert(itemUnit)
				.values(
					packs.map((p) => ({ orgId, itemId: created.id, uomId: p.uomId, factor: p.factor }))
				);
		}
		if (input.barcode) {
			await tx.insert(barcode).values({ orgId, itemId: created.id, code: input.barcode });
		}
		return created.id;
	});
}

/** An item's variants, with what is on hand of each. */
export async function variantsOf(orgId: number, parentId: number) {
	const rows = await db
		.select({
			id: item.id,
			sku: item.sku,
			name: item.name,
			variantLabel: item.variantLabel,
			salePrice: item.salePrice,
			isActive: item.isActive
		})
		.from(item)
		.where(and(eq(item.orgId, orgId), eq(item.parentItemId, parentId), isNull(item.deletedAt)))
		.orderBy(asc(item.variantLabel));
	const onHand = await onHandOf(
		orgId,
		rows.map((r) => r.id)
	);
	return rows.map((r) => ({ ...r, onHand: onHand.get(r.id) ?? 0 }));
}
