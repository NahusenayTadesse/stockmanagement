import { boolean, index, int, mysqlTable, uniqueIndex, varchar } from 'drizzle-orm/mysql-core';
import { orgRef, secureFields } from './fields';

/**
 * Who stock comes from. Every receipt names one, every stock-tracked item has a main one, and
 * every stock movement carries the supplier the goods came from — so a recall, a warranty claim or
 * a question about who supplied a bad batch always has an answer.
 *
 * `phone` is required: in Ethiopia the phone number is how a supplier is actually reached, and a
 * supplier nobody can call is not much of a record. Email and address are often unknown.
 */
export const supplier = mysqlTable(
	'supplier',
	{
		id: int('id').autoincrement().primaryKey(),
		orgId: orgRef(),
		name: varchar('name', { length: 160 }).notNull(),
		/**
		 * Required on every form. Suppliers carried over from before supplier tracking have it empty
		 * until someone fills it in; the screens flag those.
		 */
		phone: varchar('phone', { length: 40 }).notNull(),
		email: varchar('email', { length: 160 }),
		address: varchar('address', { length: 255 }),
		tin: varchar('tin', { length: 20 }),
		contactPerson: varchar('contact_person', { length: 120 }),
		note: varchar('note', { length: 255 }),
		/** Charges VAT on its invoices: its deliveries carry input VAT. */
		vatRegistered: boolean('vat_registered').notNull().default(false),
		...secureFields
	},
	(table) => [
		uniqueIndex('supplier_org_name_idx').on(table.orgId, table.name),
		index('supplier_org_phone_idx').on(table.orgId, table.phone)
	]
);
