import { int, mysqlEnum, mysqlTable, uniqueIndex, varchar } from 'drizzle-orm/mysql-core';
import { lesserFields, orgRef } from './fields';
import { LOCATION_KINDS } from '../../../constants';

/** A shop, pharmacy, warehouse site — somewhere the business operates. */
export const branch = mysqlTable(
	'branch',
	{
		id: int('id').autoincrement().primaryKey(),
		orgId: orgRef(),
		name: varchar('name', { length: 100 }).notNull(),
		/** Short and upper-case, e.g. `ADD`. Starts every document number issued at this branch. */
		code: varchar('code', { length: 10 }).notNull(),
		phone: varchar('phone', { length: 30 }),
		address: varchar('address', { length: 255 }),
		...lesserFields
	},
	(table) => [
		uniqueIndex('branch_org_name_idx').on(table.orgId, table.name),
		uniqueIndex('branch_org_code_idx').on(table.orgId, table.code)
	]
);

/**
 * Where stock physically sits inside a branch: a store room, the shop floor, a fridge, a shelf.
 * Every quantity in the system is held at a location.
 *
 * `quarantine` locations are the one kind with behaviour: expired stock may be transferred into
 * them, so it can be pulled off the shelf without being written off yet.
 */
export const location = mysqlTable(
	'location',
	{
		id: int('id').autoincrement().primaryKey(),
		orgId: orgRef(),
		branchId: int('branch_id')
			.notNull()
			.references(() => branch.id, { onDelete: 'restrict' }),
		name: varchar('name', { length: 100 }).notNull(),
		kind: mysqlEnum('kind', LOCATION_KINDS).notNull().default('storage'),
		...lesserFields
	},
	(table) => [uniqueIndex('location_branch_name_idx').on(table.branchId, table.name)]
);
