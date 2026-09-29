import {
	date,
	datetime,
	decimal,
	index,
	int,
	mysqlEnum,
	mysqlTable,
	text,
	timestamp,
	varchar,
	type AnyMySqlColumn
} from 'drizzle-orm/mysql-core';
import { user } from './auth';
import { item, uom } from './catalog';
import { customer } from './customers';
import { branch, location } from './locations';
import { stockDocument } from './stock';
import { deletionFields, orgRef, secureFields } from './fields';

/**
 * Selling: price lists, proformas, and the till's shifts and held carts. A sale itself is still an
 * ordinary stock document (an issue) — these are what surround it.
 */

/** A set of prices: wholesale, contractors, a customer's agreed prices. Items not on it sell at list price. */
export const priceList = mysqlTable('price_list', {
	id: int('id').autoincrement().primaryKey(),
	orgId: orgRef(),
	name: varchar('name', { length: 80 }).notNull(),
	note: varchar('note', { length: 255 }),
	...secureFields
});

export const priceListItem = mysqlTable(
	'price_list_item',
	{
		id: int('id').autoincrement().primaryKey(),
		orgId: orgRef(),
		priceListId: int('price_list_id')
			.notNull()
			.references(() => priceList.id, { onDelete: 'cascade' }),
		itemId: int('item_id')
			.notNull()
			.references(() => item.id, { onDelete: 'cascade' }),
		/** The unit the price is for. Empty: the item's base unit. */
		uomId: int('uom_id').references(() => uom.id, { onDelete: 'restrict' }),
		/** Before VAT, like every price. */
		price: decimal('price', { precision: 14, scale: 2, mode: 'number' }).notNull(),
		...deletionFields
	},
	(table) => [index('price_list_item_list_idx').on(table.priceListId, table.itemId)]
);

export const QUOTE_STATUSES = [
	'draft',
	'sent',
	'accepted',
	'converted',
	'expired',
	'cancelled'
] as const;

/**
 * A proforma invoice (quotation): what a sale would cost, valid until a date. Government offices
 * and NGOs buy against one. Nothing moves until it is converted into a sale.
 */
export const quote = mysqlTable(
	'quote',
	{
		id: int('id').autoincrement().primaryKey(),
		orgId: orgRef(),
		branchId: int('branch_id')
			.notNull()
			.references(() => branch.id, { onDelete: 'restrict' }),
		/** Given when it is first sent or printed as final. */
		number: varchar('number', { length: 40 }),
		status: mysqlEnum('status', QUOTE_STATUSES).notNull().default('draft'),
		quoteDate: date('quote_date', { mode: 'string' }).notNull(),
		validUntil: date('valid_until', { mode: 'string' }),
		/** A listed customer — or, for a one-off buyer, the name and TIN typed in below. */
		customerId: int('customer_id').references(() => customer.id, { onDelete: 'restrict' }),
		buyerName: varchar('buyer_name', { length: 160 }),
		buyerTin: varchar('buyer_tin', { length: 20 }),
		buyerPhone: varchar('buyer_phone', { length: 40 }),
		/** Where the goods will come from when it becomes a sale. */
		locationId: int('location_id').references(() => location.id, { onDelete: 'restrict' }),
		reference: varchar('reference', { length: 80 }),
		note: text('note'),
		terms: text('terms'),
		/** The sale it became. */
		saleId: int('sale_id').references((): AnyMySqlColumn => stockDocument.id, {
			onDelete: 'set null'
		}),
		sentAt: datetime('sent_at'),
		...secureFields
	},
	(table) => [index('quote_org_status_idx').on(table.orgId, table.status)]
);

export const quoteLine = mysqlTable(
	'quote_line',
	{
		id: int('id').autoincrement().primaryKey(),
		orgId: orgRef(),
		quoteId: int('quote_id')
			.notNull()
			.references(() => quote.id, { onDelete: 'cascade' }),
		itemId: int('item_id')
			.notNull()
			.references(() => item.id, { onDelete: 'restrict' }),
		uomId: int('uom_id')
			.notNull()
			.references(() => uom.id, { onDelete: 'restrict' }),
		quantity: decimal('quantity', { precision: 18, scale: 4, mode: 'number' }).notNull(),
		/** Before VAT, per unit above. */
		unitPrice: decimal('unit_price', { precision: 18, scale: 4, mode: 'number' }).notNull(),
		/** The price before any discount, when there is one. */
		listPrice: decimal('list_price', { precision: 18, scale: 4, mode: 'number' }),
		note: varchar('note', { length: 255 }),
		...deletionFields
	},
	(table) => [index('quote_line_quote_idx').on(table.quoteId)]
);

/**
 * A cashier's shift at a till: opened with a float, closed by counting the drawer. What the
 * drawer should hold is worked out from the cash taken and paid out during the shift.
 */
export const posShift = mysqlTable(
	'pos_shift',
	{
		id: int('id').autoincrement().primaryKey(),
		orgId: orgRef(),
		branchId: int('branch_id')
			.notNull()
			.references(() => branch.id, { onDelete: 'restrict' }),
		/** The shelf the till sells from. */
		locationId: int('location_id')
			.notNull()
			.references(() => location.id, { onDelete: 'restrict' }),
		userId: varchar('user_id', { length: 255 })
			.notNull()
			.references(() => user.id, { onDelete: 'restrict' }),
		status: mysqlEnum('status', ['open', 'closed']).notNull().default('open'),
		openedAt: timestamp('opened_at').defaultNow().notNull(),
		openingFloat: decimal('opening_float', { precision: 14, scale: 2, mode: 'number' })
			.notNull()
			.default(0),
		closedAt: datetime('closed_at'),
		closedBy: varchar('closed_by', { length: 255 }).references(() => user.id, {
			onDelete: 'set null'
		}),
		expectedCash: decimal('expected_cash', { precision: 14, scale: 2, mode: 'number' }),
		countedCash: decimal('counted_cash', { precision: 14, scale: 2, mode: 'number' }),
		note: varchar('note', { length: 255 })
	},
	(table) => [index('pos_shift_org_status_idx').on(table.orgId, table.status, table.userId)]
);

/** A cart put aside at the till — the customer went to fetch money — to be picked up again. */
export const posCart = mysqlTable('pos_cart', {
	id: int('id').autoincrement().primaryKey(),
	orgId: orgRef(),
	userId: varchar('user_id', { length: 255 }).references(() => user.id, { onDelete: 'set null' }),
	shiftId: int('shift_id').references(() => posShift.id, { onDelete: 'set null' }),
	label: varchar('label', { length: 80 }),
	customerId: int('customer_id').references(() => customer.id, { onDelete: 'set null' }),
	/** The cart as the till holds it, JSON. */
	cart: text('cart').notNull(),
	createdAt: timestamp('created_at').defaultNow().notNull()
});
