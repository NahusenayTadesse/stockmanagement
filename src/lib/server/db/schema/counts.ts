import {
	boolean,
	date,
	datetime,
	decimal,
	index,
	int,
	mysqlEnum,
	mysqlTable,
	text,
	uniqueIndex,
	varchar
} from 'drizzle-orm/mysql-core';
import { user } from './auth';
import { category, item } from './catalog';
import { branch, location } from './locations';
import { lot, stockDocument } from './stock';
import { orgRef, secureFields } from './fields';
import { COUNT_STATUSES } from '../../../constants';

/**
 * A stock count of one location. Opening it takes a snapshot of what the system expects on each
 * shelf; people then enter what they found; posting turns the differences into one stock
 * adjustment (reason: count), so the count and the ledger stay two separate, checkable records.
 */
export const stockCount = mysqlTable(
	'stock_count',
	{
		id: int('id').autoincrement().primaryKey(),
		orgId: orgRef(),
		branchId: int('branch_id')
			.notNull()
			.references(() => branch.id, { onDelete: 'restrict' }),
		locationId: int('location_id')
			.notNull()
			.references(() => location.id, { onDelete: 'restrict' }),
		/** Only this category, or everything at the location. */
		categoryId: int('category_id').references(() => category.id, { onDelete: 'set null' }),
		countDate: date('count_date', { mode: 'string' }).notNull(),
		status: mysqlEnum('status', COUNT_STATUSES).notNull().default('open'),
		/** Counters do not see the expected quantity, so they count rather than confirm. */
		blind: boolean('blind').notNull().default(true),
		note: text('note'),
		/** The adjustment the count posted, when it found differences. */
		adjustmentId: int('adjustment_id').references(() => stockDocument.id, { onDelete: 'set null' }),
		postedAt: datetime('posted_at'),
		postedBy: varchar('posted_by', { length: 255 }).references(() => user.id, {
			onDelete: 'set null'
		}),
		...secureFields
	},
	(table) => [index('stock_count_org_status_idx').on(table.orgId, table.status)]
);

export const stockCountLine = mysqlTable(
	'stock_count_line',
	{
		id: int('id').autoincrement().primaryKey(),
		orgId: orgRef(),
		countId: int('count_id')
			.notNull()
			.references(() => stockCount.id, { onDelete: 'cascade' }),
		itemId: int('item_id')
			.notNull()
			.references(() => item.id, { onDelete: 'restrict' }),
		lotId: int('lot_id').references(() => lot.id, { onDelete: 'restrict' }),
		/** `lotId` or 0, so (count, item, lot) can be unique. */
		lotKey: int('lot_key').notNull().default(0),
		/** What the system held when the count was opened, in base units. */
		expected: decimal('expected', { precision: 18, scale: 4, mode: 'number' }).notNull(),
		/** What was found. Null until counted. */
		counted: decimal('counted', { precision: 18, scale: 4, mode: 'number' }),
		/** Found on the shelf but not in the snapshot. */
		addedDuringCount: boolean('added_during_count').notNull().default(false),
		note: varchar('note', { length: 255 }),
		countedBy: varchar('counted_by', { length: 255 }).references(() => user.id, {
			onDelete: 'set null'
		})
	},
	(table) => [uniqueIndex('stock_count_line_key_idx').on(table.countId, table.itemId, table.lotKey)]
);
