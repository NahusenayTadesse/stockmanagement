import {
	decimal,
	mysqlEnum,
	mysqlTable,
	varchar,
	text,
	timestamp,
	int,
	boolean,
	datetime,
	index,
	uniqueIndex,
	type AnyMySqlColumn
} from 'drizzle-orm/mysql-core';
import { relations, sql } from 'drizzle-orm';
import { branch } from './locations';
import { COSTING_METHODS } from '../../../constants';

/**
 * A tenant: one business using the system. Every business table carries an `orgId` pointing here,
 * and every query a page runs is scoped by the viewer's own (`locals.orgId`, set in
 * `hooks.server.ts` from the user row, never from the request).
 */
export const organization = mysqlTable('organization', {
	id: int('id').autoincrement().primaryKey(),
	name: varchar('name', { length: 120 }).notNull(),
	/** Ethiopian taxpayer identification number, printed on documents. */
	tin: varchar('tin', { length: 20 }),
	phone: varchar('phone', { length: 30 }),
	address: varchar('address', { length: 255 }),
	/** Stored file name of the logo (the kit's file store). Shown in the sidebar and on printouts. */
	logo: varchar('logo', { length: 100 }),
	/**
	 * Whether the business sells to customers. Off for an internal store (hospital, NGO, school),
	 * which issues to departments: the customer list and every customer picker are hidden.
	 */
	sellsToCustomers: boolean('sells_to_customers').default(true).notNull(),
	/** Registered for VAT: sales carry output VAT, and VAT on deliveries is input VAT. */
	vatRegistered: boolean('vat_registered').default(false).notNull(),
	vatRate: decimal('vat_rate', { precision: 5, scale: 2, mode: 'number' }).default(15).notNull(),
	/**
	 * A withholding agent: withholds tax from payments for goods at or above the threshold, at the
	 * rate for suppliers with a TIN (the rate for those without is in `$lib/server/tax`).
	 */
	withholdingAgent: boolean('withholding_agent').default(false).notNull(),
	withholdingRate: decimal('withholding_rate', { precision: 5, scale: 2, mode: 'number' })
		.default(3)
		.notNull(),
	/**
	 * Turnover tax (TOT) rate on goods sold, for a business that is not VAT-registered. Empty: not a
	 * TOT payer. Items may set their own rate (services are often taxed higher).
	 */
	totRate: decimal('tot_rate', { precision: 5, scale: 2, mode: 'number' }),
	/**
	 * The largest discount (percent off the price) a seller may give without the right to give
	 * more. Empty: no limit.
	 */
	maxDiscountPercent: decimal('max_discount_percent', { precision: 5, scale: 2, mode: 'number' }),
	/**
	 * Electronic invoicing with the Ministry of Revenues. Empty: off. `sandbox` issues local
	 * reference numbers without calling anyone, for trying it out; `live` sends to the endpoint.
	 */
	einvoiceMode: mysqlEnum('einvoice_mode', ['sandbox', 'live']),
	einvoiceEndpoint: varchar('einvoice_endpoint', { length: 255 }),
	einvoiceTokenUrl: varchar('einvoice_token_url', { length: 255 }),
	einvoiceClientId: varchar('einvoice_client_id', { length: 120 }),
	/** Stored encrypted (`$lib/server/secrets`); never sent to the browser. */
	einvoiceSecret: varchar('einvoice_secret', { length: 512 }),
	/** How stock going out is valued. Empty: moving average. */
	costingMethod: mysqlEnum('costing_method', COSTING_METHODS),
	/**
	 * Hold stock for accepted proformas and approved requisitions, so the till and other issues
	 * cannot sell what was promised.
	 */
	reserveStock: boolean('reserve_stock').default(false).notNull(),
	// ── Maker-checker. Empty: no approval needed. ──
	/** Adjustments worth this much or more (at cost) wait for a second person. */
	approveAdjustmentsOver: decimal('approve_adjustments_over', {
		precision: 14,
		scale: 2,
		mode: 'number'
	}),
	/** Every write-off (stock removed by an adjustment) waits for a second person. */
	approveWriteOffs: boolean('approve_write_offs').default(false).notNull(),
	/** Counts whose differences come to this much or more (at cost) wait for a second person. */
	approveCountsOver: decimal('approve_counts_over', { precision: 14, scale: 2, mode: 'number' }),
	/** Purchase orders worth this much or more wait for a second person before they go out. */
	approveOrdersOver: decimal('approve_orders_over', { precision: 14, scale: 2, mode: 'number' }),
	// ── SMS (GeezSMS; the account is the platform's, `SMS_KEY`). Off until turned on. ──
	smsEnabled: boolean('sms_enabled').default(false).notNull(),
	/** Text named customers a receipt when a sale to them is posted. */
	smsSales: boolean('sms_sales').default(false).notNull(),
	/** Text customers when a payment from them is recorded, with what they still owe. */
	smsPayments: boolean('sms_payments').default(false).notNull(),
	/**
	 * Staff mobiles for alerts (approvals waiting, transfers on the way, requisitions, the daily
	 * digest), comma-separated. Empty: no staff alerts.
	 */
	smsAlertPhones: varchar('sms_alert_phones', { length: 255 }),
	/** How messages are signed at the start. Empty: the business name. */
	smsSignature: varchar('sms_signature', { length: 40 }),
	withholdingThreshold: decimal('withholding_threshold', {
		precision: 14,
		scale: 2,
		mode: 'number'
	})
		.default(10000)
		.notNull(),
	isActive: boolean('is_active').default(true).notNull(),
	/**
	 * When an owner put the getting-started guide away (Dashboard → Hide the guide). Empty: it
	 * shows to whoever runs the business until every step is done.
	 */
	guideHiddenAt: datetime('guide_hidden_at'),
	createdAt: timestamp('created_at').defaultNow().notNull(),
	updatedAt: timestamp('updated_at')
		.default(sql`CURRENT_TIMESTAMP(3) on update CURRENT_TIMESTAMP(3)`)
		.notNull()
});

/**
 * Identity is owned by better-auth, but `user` also carries this app's columns (`orgId`, `roleId`,
 * `isActive`, the soft-delete pair), so it is declared here rather than generated. Anything added
 * that better-auth must read or accept has to be declared again under `user.additionalFields` in
 * `$lib/server/auth`.
 *
 * The permission model is dentalClinic's: `roleId` gives a role's permissions, and rows in
 * `special_permissions` replace them for one user. The admin plugin's own `role` column is kept
 * only because the plugin needs it; no application check reads it.
 */
export const user = mysqlTable(
	'user',
	{
		id: varchar('id', { length: 255 }).primaryKey(),
		name: varchar('name', { length: 255 }).notNull(),
		email: varchar('email', { length: 255 }).notNull().unique(),
		emailVerified: boolean('email_verified').default(false).notNull(),
		image: text('image'),

		/** One user belongs to one business. */
		orgId: int('org_id')
			.notNull()
			.references((): AnyMySqlColumn => organization.id, { onDelete: 'restrict' }),

		/** `restrict`: a role somebody still holds cannot be deleted out from under them. */
		roleId: int('role_id')
			.notNull()
			.references((): AnyMySqlColumn => roles.id, { onDelete: 'restrict' }),

		/**
		 * Where this person usually works: the default on their forms. Which branches they may see
		 * and move stock in is `user_branch`.
		 */
		branchId: int('branch_id').references((): AnyMySqlColumn => branch.id, {
			onDelete: 'set null'
		}),

		/** Business state and the sign-in gate. Distinct from `deletedAt`: a deactivated user comes back. */
		isActive: boolean('is_active').default(true).notNull(),

		/**
		 * Digital Construct's own staff: may open the site admin (`/admin`), which sees every
		 * business's subscription. Set by the platform seed only; no screen grants it.
		 */
		siteAdmin: boolean('site_admin').default(false).notNull(),

		// better-auth admin plugin columns. See the note above: nothing in the app reads `role`.
		role: varchar('role', { length: 64 }),
		banned: boolean('banned').default(false),
		banReason: text('ban_reason'),
		banExpires: datetime('ban_expires'),

		createdAt: timestamp('created_at', { fsp: 3 }).defaultNow().notNull(),
		updatedAt: timestamp('updated_at')
			.default(sql`CURRENT_TIMESTAMP(3) on update CURRENT_TIMESTAMP(3)`)
			.notNull(),
		deletedAt: datetime('deleted_at'),
		deletedBy: varchar('deleted_by', { length: 255 })
	},
	(table) => [index('user_org_idx').on(table.orgId)]
);

export const session = mysqlTable(
	'session',
	{
		id: varchar('id', { length: 255 }).primaryKey(),
		token: varchar('token', { length: 255 }).notNull().unique(),
		userId: varchar('user_id', { length: 255 })
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		expiresAt: datetime('expires_at').notNull(),
		ipAddress: text('ip_address'),
		userAgent: text('user_agent'),
		createdAt: timestamp('created_at', { fsp: 3 }).defaultNow().notNull(),
		updatedAt: timestamp('updated_at')
			.default(sql`CURRENT_TIMESTAMP(3) on update CURRENT_TIMESTAMP(3)`)
			.notNull(),
		impersonatedBy: varchar('impersonated_by', { length: 255 })
	},
	(table) => [index('session_user_id_idx').on(table.userId)]
);

export const account = mysqlTable(
	'account',
	{
		id: varchar('id', { length: 255 }).primaryKey(),
		accountId: varchar('account_id', { length: 255 }).notNull(),
		providerId: varchar('provider_id', { length: 255 }).notNull(),
		userId: varchar('user_id', { length: 255 })
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		accessToken: text('access_token'),
		refreshToken: text('refresh_token'),
		idToken: text('id_token'),
		accessTokenExpiresAt: datetime('access_token_expires_at'),
		refreshTokenExpiresAt: datetime('refresh_token_expires_at'),
		scope: text('scope'),
		password: text('password'),
		createdAt: timestamp('created_at', { fsp: 3 }).defaultNow().notNull(),
		updatedAt: timestamp('updated_at')
			.default(sql`CURRENT_TIMESTAMP(3) on update CURRENT_TIMESTAMP(3)`)
			.notNull()
	},
	(table) => [
		index('account_user_id_idx').on(table.userId),
		uniqueIndex('account_provider_account_idx').on(table.providerId, table.accountId)
	]
);

export const verification = mysqlTable(
	'verification',
	{
		id: varchar('id', { length: 255 }).primaryKey(),
		identifier: varchar('identifier', { length: 255 }).notNull(),
		value: text('value').notNull(),
		expiresAt: datetime('expires_at').notNull(),
		createdAt: timestamp('created_at', { fsp: 3 }).defaultNow().notNull(),
		updatedAt: timestamp('updated_at')
			.default(sql`CURRENT_TIMESTAMP(3) on update CURRENT_TIMESTAMP(3)`)
			.notNull()
	},
	(table) => [index('verification_identifier_idx').on(table.identifier)]
);

/**
 * A business's own roles. Each organization gets an `isOwner` role at registration that holds
 * every permission; `seedPermissions` grants new permissions to it on boot, so the owner never
 * loses super-admin status when a permission is added.
 */
export const roles = mysqlTable(
	'roles',
	{
		id: int('id').autoincrement().primaryKey(),
		orgId: int('org_id')
			.notNull()
			.references((): AnyMySqlColumn => organization.id, { onDelete: 'cascade' }),
		name: varchar('name', { length: 64 }).notNull(),
		description: varchar('description', { length: 255 }),
		/** The owner role cannot be edited or deleted: it is what keeps somebody able to manage the rest. */
		isOwner: boolean('is_owner').default(false).notNull(),
		isActive: boolean('is_active').default(true).notNull(),
		deletedAt: datetime('deleted_at'),
		deletedBy: varchar('deleted_by', { length: 255 }).references((): AnyMySqlColumn => user.id, {
			onDelete: 'set null'
		})
	},
	(table) => [uniqueIndex('roles_org_name_idx').on(table.orgId, table.name)]
);

export const userRelations = relations(user, ({ one, many }) => ({
	role: one(roles, { fields: [user.roleId], references: [roles.id] }),
	organization: one(organization, { fields: [user.orgId], references: [organization.id] }),
	sessions: many(session),
	accounts: many(account)
}));

export const sessionRelations = relations(session, ({ one }) => ({
	user: one(user, { fields: [session.userId], references: [user.id] })
}));

export const accountRelations = relations(account, ({ one }) => ({
	user: one(user, { fields: [account.userId], references: [user.id] })
}));

/**
 * The branches a user works in. A user with none — or with `branches.all` — sees every branch;
 * one with rows sees and moves stock only in those.
 */
export const userBranch = mysqlTable(
	'user_branch',
	{
		id: int('id').autoincrement().primaryKey(),
		orgId: int('org_id')
			.notNull()
			.references((): AnyMySqlColumn => organization.id, { onDelete: 'cascade' }),
		userId: varchar('user_id', { length: 255 })
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		branchId: int('branch_id')
			.notNull()
			.references((): AnyMySqlColumn => branch.id, { onDelete: 'cascade' })
	},
	(table) => [uniqueIndex('user_branch_key_idx').on(table.userId, table.branchId)]
);
