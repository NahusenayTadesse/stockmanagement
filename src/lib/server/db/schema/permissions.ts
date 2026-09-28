import { int, mysqlTable, uniqueIndex, varchar } from 'drizzle-orm/mysql-core';
import { relations } from 'drizzle-orm';
import { roles, user } from './auth';
import { secureFields } from './fields';

/**
 * What the system can grant. Global, not per tenant: the names come from the code (route rules and
 * code-only checks, see `$lib/server/seedPermissions`), so every business sees the same list and
 * decides only who holds what.
 */
export const permissions = mysqlTable('permissions', {
	id: int('id').autoincrement().primaryKey(),
	name: varchar('name', { length: 50 }).notNull().unique(),
	description: varchar('description', { length: 255 })
});

export const rolePermissions = mysqlTable(
	'role_permissions',
	{
		id: int('id').autoincrement().primaryKey(),
		roleId: int('role_id')
			.notNull()
			.references(() => roles.id, { onDelete: 'cascade' }),
		permissionId: int('permission_id')
			.notNull()
			.references(() => permissions.id, { onDelete: 'cascade' }),
		...secureFields
	},
	(table) => [uniqueIndex('role_permission_idx').on(table.roleId, table.permissionId)]
);

/**
 * Per-user grants. When a user has any, they *replace* the role's list rather than adding to it —
 * dentalClinic's rule, kept so a user can be given less than their role as well as more.
 */
export const specialPermissions = mysqlTable(
	'special_permissions',
	{
		id: int('id').autoincrement().primaryKey(),
		userId: varchar('user_id', { length: 255 })
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		permissionId: int('permission_id')
			.notNull()
			.references(() => permissions.id, { onDelete: 'cascade' }),
		...secureFields
	},
	(table) => [uniqueIndex('special_permission_idx').on(table.userId, table.permissionId)]
);

export const rolesRelations = relations(roles, ({ many }) => ({
	rolePermissions: many(rolePermissions)
}));

export const permissionsRelations = relations(permissions, ({ many }) => ({
	rolePermissions: many(rolePermissions),
	specialPermissions: many(specialPermissions)
}));

export const rolePermissionsRelations = relations(rolePermissions, ({ one }) => ({
	role: one(roles, { fields: [rolePermissions.roleId], references: [roles.id] }),
	permission: one(permissions, {
		fields: [rolePermissions.permissionId],
		references: [permissions.id]
	})
}));

export const specialPermissionsRelations = relations(specialPermissions, ({ one }) => ({
	user: one(user, { fields: [specialPermissions.userId], references: [user.id] }),
	permission: one(permissions, {
		fields: [specialPermissions.permissionId],
		references: [permissions.id]
	})
}));
