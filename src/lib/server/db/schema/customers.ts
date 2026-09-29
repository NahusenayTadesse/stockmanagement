import {
	boolean,
	decimal,
	index,
	int,
	mysqlTable,
	varchar,
	type AnyMySqlColumn
} from 'drizzle-orm/mysql-core';
import { priceList } from './sales';
import { orgRef, secureFields } from './fields';

/**
 * Who stock is sold or issued to — when anyone cares to say. Nothing requires a customer: a
 * walk-in buyer rarely leaves a name, and an internal store (a hospital, an NGO, a school) issues to
 * departments and people, written in `stock_document.party`, and never sells at all.
 *
 * Only the name is required. Unlike suppliers, names are not unique: two customers called Abebe
 * Kebede are normal, and the phone tells them apart.
 */
export const customer = mysqlTable(
	'customer',
	{
		id: int('id').autoincrement().primaryKey(),
		orgId: orgRef(),
		name: varchar('name', { length: 160 }).notNull(),
		phone: varchar('phone', { length: 40 }),
		email: varchar('email', { length: 160 }),
		address: varchar('address', { length: 255 }),
		tin: varchar('tin', { length: 20 }),
		note: varchar('note', { length: 255 }),
		/**
		 * How much the customer may owe at once (ዱቤ). Empty: no limit. 0: cash only — every sale must
		 * be paid before it is posted.
		 */
		creditLimit: decimal('credit_limit', { precision: 14, scale: 2, mode: 'number' }),
		/** Days a credit sale may stay unpaid before it is overdue. */
		creditDays: int('credit_days').notNull().default(30),
		/**
		 * A withholding agent (a large company, NGO or government office): it keeps back part of what
		 * it pays and hands over a withholding receipt instead.
		 */
		withholdsTax: boolean('withholds_tax').notNull().default(false),
		/** Their prices, when they buy at other than list price (wholesale, contract). Optional. */
		priceListId: int('price_list_id').references((): AnyMySqlColumn => priceList.id, {
			onDelete: 'set null'
		}),
		...secureFields
	},
	(table) => [
		index('customer_org_name_idx').on(table.orgId, table.name),
		index('customer_org_phone_idx').on(table.orgId, table.phone)
	]
);
