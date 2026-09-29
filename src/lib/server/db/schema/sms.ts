import {
	index,
	int,
	mysqlEnum,
	mysqlTable,
	text,
	timestamp,
	varchar
} from 'drizzle-orm/mysql-core';
import { user } from './auth';
import { customer } from './customers';
import { supplier } from './suppliers';
import { orgRef } from './fields';
import { SMS_STATUSES } from '../../../constants';

/**
 * Every text message the system sent, or tried to: to whom, what it said, and what came back.
 * The record of what a customer was told, and the answer to "did they get it?".
 */
export const smsMessage = mysqlTable(
	'sms_message',
	{
		id: int('id').autoincrement().primaryKey(),
		orgId: orgRef(),
		/** As sent: `2519…` or `2517…`. */
		phone: varchar('phone', { length: 20 }).notNull(),
		body: text('body').notNull(),
		/** What it was for: `sale`, `payment`, `reminder`, `alert`, `custom`… */
		kind: varchar('kind', { length: 30 }).notNull(),
		status: mysqlEnum('status', SMS_STATUSES).notNull(),
		error: varchar('error', { length: 255 }),
		/** Message units the provider charged, when it says. */
		units: int('units'),
		customerId: int('customer_id').references(() => customer.id, { onDelete: 'set null' }),
		supplierId: int('supplier_id').references(() => supplier.id, { onDelete: 'set null' }),
		/** The document, proforma or order it was about (its page's link), when there is one. */
		link: varchar('link', { length: 120 }),
		createdBy: varchar('created_by', { length: 255 }).references(() => user.id, {
			onDelete: 'set null'
		}),
		createdAt: timestamp('created_at').defaultNow().notNull()
	},
	(table) => [
		index('sms_message_org_idx').on(table.orgId, table.createdAt),
		index('sms_message_customer_idx').on(table.customerId)
	]
);
