import {
	boolean,
	date,
	datetime,
	decimal,
	foreignKey,
	index,
	int,
	mysqlEnum,
	mysqlTable,
	text,
	timestamp,
	uniqueIndex,
	varchar
} from 'drizzle-orm/mysql-core';
import { sql } from 'drizzle-orm';
import { user } from './auth';
import { jsonText } from './audit';
import { orgRef, secureFields } from './fields';
import {
	CONTACT_STATUSES,
	SUBSCRIPTION_PAYMENT_METHODS,
	SUBSCRIPTION_PAYMENT_STATUSES
} from '../../../constants';

/**
 * The platform's own tables: what Digital Construct sells (packages), what each business is
 * subscribed to and has paid, where transfers are paid into, and what visitors wrote on the
 * contact page. None of them belongs to a business the way stock does; `subscription` and
 * `subscription_payment` carry `org_id` to say whose they are, and only the site admin writes to
 * the rest.
 */

/**
 * A package a business subscribes to. Every package opens the whole application; they differ in
 * how many people and branches a business may have, and how often it pays.
 */
export const servicePackage = mysqlTable(
	'package',
	{
		id: int('id').autoincrement().primaryKey(),
		name: varchar('name', { length: 60 }).notNull(),
		/** In links: `/register?package=starter`. */
		slug: varchar('slug', { length: 60 }).notNull(),
		description: varchar('description', { length: 255 }),
		/** What one billing period costs, in birr. */
		price: decimal('price', { precision: 12, scale: 2, mode: 'number' }).notNull(),
		/** Months one payment covers: 1, 3, 6 or 12. */
		billingMonths: int('billing_months').notNull().default(1),
		/** Active user accounts allowed. Empty: no limit. */
		maxUsers: int('max_users'),
		/** Branches allowed. Empty: no limit. */
		maxBranches: int('max_branches'),
		/** Days a new business may use the system before the first payment. */
		trialDays: int('trial_days').notNull().default(14),
		/** Selling points printed on the pricing page, beyond the limits. One line each. */
		highlights: jsonText('highlights').$type<string[]>(),
		/** Marked "Most popular" on the pricing page. */
		isFeatured: boolean('is_featured').default(false).notNull(),
		sortOrder: int('sort_order').notNull().default(0),
		...secureFields
	},
	(table) => [
		uniqueIndex('package_name_idx').on(table.name),
		uniqueIndex('package_slug_idx').on(table.slug)
	]
);

/**
 * What a business is subscribed to, and until when. One row per business.
 *
 * Whether the business may work is read off this row and the day (`$lib/billing`), never stored:
 * `paidUntil` is the last day covered — by the trial, or by the payments since — and a few days
 * of grace follow it. `complimentary` never runs out (the platform's own business, a partner);
 * `suspendedAt` closes the business whatever was paid.
 */
export const subscription = mysqlTable(
	'subscription',
	{
		id: int('id').autoincrement().primaryKey(),
		orgId: orgRef(),
		packageId: int('package_id')
			.notNull()
			.references(() => servicePackage.id, { onDelete: 'restrict' }),
		startedOn: date('started_on', { mode: 'string' }).notNull(),
		/** The last day of the free trial. Kept after it ends, to tell "on trial" from "paid". */
		trialEndsOn: date('trial_ends_on', { mode: 'string' }),
		/** The last day the subscription covers. */
		paidUntil: date('paid_until', { mode: 'string' }).notNull(),
		complimentary: boolean('complimentary').default(false).notNull(),
		suspendedAt: datetime('suspended_at'),
		suspendedReason: varchar('suspended_reason', { length: 255 }),
		createdAt: timestamp('created_at').defaultNow().notNull(),
		updatedAt: timestamp('updated_at')
			.default(sql`CURRENT_TIMESTAMP(3) on update CURRENT_TIMESTAMP(3)`)
			.notNull()
	},
	(table) => [uniqueIndex('subscription_org_idx').on(table.orgId)]
);

/** An account transfers are paid into, shown to a business choosing to pay by bank. */
export const platformBankAccount = mysqlTable('platform_bank_account', {
	id: int('id').autoincrement().primaryKey(),
	bankName: varchar('bank_name', { length: 80 }).notNull(),
	accountName: varchar('account_name', { length: 120 }).notNull(),
	accountNumber: varchar('account_number', { length: 40 }).notNull(),
	sortOrder: int('sort_order').notNull().default(0),
	...secureFields
});

/**
 * One payment for a subscription, or an attempt at one. A Chapa attempt is recorded before the
 * payer leaves for Chapa, so its webhook can be matched; a bank transfer is recorded with its
 * receipt and waits for a site admin. Only a `paid` row extends the subscription, and it says by
 * how much: `periodStart`–`periodEnd`.
 */
export const subscriptionPayment = mysqlTable(
	'subscription_payment',
	{
		id: int('id').autoincrement().primaryKey(),
		orgId: orgRef(),
		/** The package paid for — the subscription moves to it when the payment is confirmed. */
		packageId: int('package_id')
			.notNull()
			.references(() => servicePackage.id, { onDelete: 'restrict' }),
		amount: decimal('amount', { precision: 12, scale: 2, mode: 'number' }).notNull(),
		/** Months this payment buys, from the package at the time. */
		months: int('months').notNull(),
		method: mysqlEnum('method', SUBSCRIPTION_PAYMENT_METHODS).notNull(),
		status: mysqlEnum('status', SUBSCRIPTION_PAYMENT_STATUSES).notNull().default('pending'),
		/** Chapa's `tx_ref` for this attempt: ours, random, and what the webhook names. */
		txRef: varchar('tx_ref', { length: 64 }),
		bankAccountId: int('bank_account_id'),
		/** Stored file name of the transfer receipt (the kit's file store). */
		receiptFile: varchar('receipt_file', { length: 100 }),
		/** The bank's own reference for the transfer, as the payer typed it. */
		payerReference: varchar('payer_reference', { length: 100 }),
		note: varchar('note', { length: 255 }),
		periodStart: date('period_start', { mode: 'string' }),
		periodEnd: date('period_end', { mode: 'string' }),
		paidAt: datetime('paid_at'),
		/** The site admin who confirmed or rejected a transfer, or recorded a manual payment. */
		reviewedBy: varchar('reviewed_by', { length: 255 }).references(() => user.id, {
			onDelete: 'set null'
		}),
		reviewedAt: datetime('reviewed_at'),
		/** Why a receipt was turned down; shown to the business. */
		reviewNote: varchar('review_note', { length: 255 }),
		createdBy: varchar('created_by', { length: 255 }).references(() => user.id, {
			onDelete: 'set null'
		}),
		createdAt: timestamp('created_at').defaultNow().notNull(),
		updatedAt: timestamp('updated_at')
			.default(sql`CURRENT_TIMESTAMP(3) on update CURRENT_TIMESTAMP(3)`)
			.notNull()
	},
	(table) => [
		// Named by hand: the generated name is at MySQL's 64-character limit.
		foreignKey({
			name: 'subscription_payment_bank_account_fk',
			columns: [table.bankAccountId],
			foreignColumns: [platformBankAccount.id]
		}).onDelete('set null'),
		uniqueIndex('subscription_payment_tx_ref_idx').on(table.txRef),
		index('subscription_payment_org_idx').on(table.orgId, table.createdAt),
		index('subscription_payment_status_idx').on(table.status)
	]
);

/** What a visitor wrote on the contact page. */
export const contactMessage = mysqlTable(
	'contact_message',
	{
		id: int('id').autoincrement().primaryKey(),
		name: varchar('name', { length: 100 }).notNull(),
		email: varchar('email', { length: 255 }).notNull(),
		phone: varchar('phone', { length: 30 }),
		company: varchar('company', { length: 120 }),
		subject: varchar('subject', { length: 150 }).notNull(),
		message: text('message').notNull(),
		/** The language the visitor was reading the site in. */
		locale: varchar('locale', { length: 5 }),
		status: mysqlEnum('status', CONTACT_STATUSES).notNull().default('new'),
		/** The site admin's own note: who called back, what was agreed. */
		adminNote: varchar('admin_note', { length: 500 }),
		handledBy: varchar('handled_by', { length: 255 }).references(() => user.id, {
			onDelete: 'set null'
		}),
		handledAt: datetime('handled_at'),
		createdAt: timestamp('created_at').defaultNow().notNull()
	},
	(table) => [index('contact_message_status_idx').on(table.status, table.createdAt)]
);

export type ServicePackage = typeof servicePackage.$inferSelect;
