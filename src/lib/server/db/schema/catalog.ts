import {
	boolean,
	decimal,
	index,
	int,
	mysqlEnum,
	mysqlTable,
	text,
	uniqueIndex,
	varchar
} from 'drizzle-orm/mysql-core';
import { deletionFields, lesserFields, orgRef, secureFields } from './fields';
import { supplier } from './suppliers';
import { STORAGE_CONDITIONS } from '../../../constants';

export const category = mysqlTable(
	'category',
	{
		id: int('id').autoincrement().primaryKey(),
		orgId: orgRef(),
		name: varchar('name', { length: 100 }).notNull(),
		nameAm: varchar('name_am', { length: 100 }),
		/**
		 * How far ahead a lot in this category counts as "expiring soon". Medicine wants months of
		 * warning to return or discount it; bread wants a day or two.
		 */
		expiryWarningDays: int('expiry_warning_days').notNull().default(90),
		...lesserFields
	},
	(table) => [uniqueIndex('category_org_name_idx').on(table.orgId, table.name)]
);

/** Units of measure: tablet, piece, kg, quintal, litre, box... */
export const uom = mysqlTable(
	'uom',
	{
		id: int('id').autoincrement().primaryKey(),
		orgId: orgRef(),
		name: varchar('name', { length: 40 }).notNull(),
		symbol: varchar('symbol', { length: 12 }).notNull(),
		...lesserFields
	},
	(table) => [uniqueIndex('uom_org_name_idx').on(table.orgId, table.name)]
);

/**
 * Anything the business stocks, sells, buys, uses or rents out.
 *
 * **One table for every kind of product.** Medicine, food, spare parts and rental equipment differ
 * in which of the flags below are on, not in which table they live in, so the ledger, the counts
 * and the reports work the same for all of them.
 *
 * Quantities everywhere are in `baseUomId`. Other units an item is bought, sold or counted in are
 * rows in `item_unit` with a factor back to the base.
 */
export const item = mysqlTable(
	'item',
	{
		id: int('id').autoincrement().primaryKey(),
		orgId: orgRef(),
		sku: varchar('sku', { length: 40 }).notNull(),
		name: varchar('name', { length: 160 }).notNull(),
		nameAm: varchar('name_am', { length: 160 }),
		categoryId: int('category_id').references(() => category.id, { onDelete: 'set null' }),
		baseUomId: int('base_uom_id')
			.notNull()
			.references(() => uom.id, { onDelete: 'restrict' }),
		description: text('description'),
		/**
		 * Where this item normally comes from. Required on the form for stock-tracked items; services
		 * have none. Also the supplier a movement falls back to when the stock it moves carries none
		 * of its own (items without lots or serials).
		 */
		supplierId: int('supplier_id').references(() => supplier.id, { onDelete: 'restrict' }),

		// ── What the item is ──────────────────────────────────────────────────────────────────
		/** False for services: nothing is counted and no ledger rows are written. */
		stockTracked: boolean('stock_tracked').notNull().default(true),
		/** Every receipt names a lot/batch number, and every issue takes from a lot. */
		trackLots: boolean('track_lots').notNull().default(false),
		/** Every lot carries an expiry date; expired lots cannot be issued. Implies `trackLots`. */
		trackExpiry: boolean('track_expiry').notNull().default(false),
		/** Each unit has its own serial number (equipment, phones, generators). */
		trackSerials: boolean('track_serials').notNull().default(false),
		sellable: boolean('sellable').notNull().default(true),
		purchasable: boolean('purchasable').notNull().default(true),
		/** Can be rented out. Leasing arrives in a later phase; the flag is here so items are set up once. */
		leasable: boolean('leasable').notNull().default(false),
		/** Used up internally (cleaning supplies, ingredients) rather than sold. */
		consumable: boolean('consumable').notNull().default(false),
		perishable: boolean('perishable').notNull().default(false),
		prescriptionOnly: boolean('prescription_only').notNull().default(false),
		/** Narcotics and psychotropics: EFDA wants a running register of these. */
		controlledSubstance: boolean('controlled_substance').notNull().default(false),
		storageCondition: mysqlEnum('storage_condition', STORAGE_CONDITIONS)
			.notNull()
			.default('ambient'),

		// ── Numbers ───────────────────────────────────────────────────────────────────────────
		/** In base units. Stock at or below this shows as "reorder". */
		reorderLevel: decimal('reorder_level', { precision: 18, scale: 4, mode: 'number' }),
		salePrice: decimal('sale_price', { precision: 14, scale: 2, mode: 'number' }),
		/**
		 * Moving weighted-average cost per base unit, maintained by posting receipts. Never set
		 * from a form: it is the ledger's number, and the value of all stock is computed from it.
		 */
		avgCost: decimal('avg_cost', { precision: 18, scale: 4, mode: 'number' }).notNull().default(0),

		...secureFields
	},
	(table) => [
		uniqueIndex('item_org_sku_idx').on(table.orgId, table.sku),
		index('item_org_name_idx').on(table.orgId, table.name)
	]
);

/**
 * Another unit an item comes in: a box of 100 tablets, a carton of 24, a quintal of 100 kg.
 * `factor` is how many base units one of these is.
 *
 * No unique index on (item, unit): rows are soft-deleted, and a deleted row would block adding the
 * unit back. The line form checks for a live duplicate instead.
 */
export const itemUnit = mysqlTable(
	'item_unit',
	{
		id: int('id').autoincrement().primaryKey(),
		orgId: orgRef(),
		itemId: int('item_id')
			.notNull()
			.references(() => item.id, { onDelete: 'cascade' }),
		uomId: int('uom_id')
			.notNull()
			.references(() => uom.id, { onDelete: 'restrict' }),
		factor: decimal('factor', { precision: 18, scale: 6, mode: 'number' }).notNull(),
		...deletionFields
	},
	(table) => [index('item_unit_item_idx').on(table.itemId)]
);

/** A code printed on the item or its packaging. Several per item: the box and the strip differ. */
export const barcode = mysqlTable(
	'barcode',
	{
		id: int('id').autoincrement().primaryKey(),
		orgId: orgRef(),
		itemId: int('item_id')
			.notNull()
			.references(() => item.id, { onDelete: 'cascade' }),
		code: varchar('code', { length: 64 }).notNull(),
		/** The unit this code identifies, when it is a pack rather than a single base unit. */
		uomId: int('uom_id').references(() => uom.id, { onDelete: 'set null' }),
		...deletionFields
	},
	(table) => [index('barcode_org_code_idx').on(table.orgId, table.code)]
);
