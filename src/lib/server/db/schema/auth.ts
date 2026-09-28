import {
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
	isActive: boolean('is_active').default(true).notNull(),
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

		/** Where this person usually works. Optional; branch scoping comes in a later phase. */
		branchId: int('branch_id').references((): AnyMySqlColumn => branch.id, {
			onDelete: 'set null'
		}),

		/** Business state and the sign-in gate. Distinct from `deletedAt`: a deactivated user comes back. */
		isActive: boolean('is_active').default(true).notNull(),

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
