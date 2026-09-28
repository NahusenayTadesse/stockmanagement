import { and, count, eq } from 'drizzle-orm';
import { notDeleted } from '@nahu/admin-kit/server/softDelete';
import { db } from '$lib/server/db';
import {
	permissions,
	rolePermissions,
	roles,
	specialPermissions,
	user
} from '$lib/server/db/schema';

/**
 * What a signed-in user may do — dentalClinic's rule:
 *
 *   - their role's permissions, unless they have special permissions of their own, which then
 *     *replace* the role's list (so a user can be given less than their role, not only more)
 *   - a deleted or inactive role, or a deleted grant, confers nothing
 *   - a super admin is someone holding every permission in the table
 */
export async function loadGrant(userId: string): Promise<{
	permList: string[];
	isSuperAdmin: boolean;
}> {
	const [rolePerms, specialPerms] = await Promise.all([
		db
			.select({ name: permissions.name })
			.from(user)
			.innerJoin(
				roles,
				and(
					eq(user.roleId, roles.id),
					eq(roles.orgId, user.orgId),
					eq(roles.isActive, true),
					notDeleted(roles)
				)
			)
			.innerJoin(
				rolePermissions,
				and(eq(roles.id, rolePermissions.roleId), notDeleted(rolePermissions))
			)
			.innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
			.where(and(eq(user.id, userId), notDeleted(user))),

		db
			.select({ name: permissions.name })
			.from(specialPermissions)
			.innerJoin(permissions, eq(specialPermissions.permissionId, permissions.id))
			.where(and(eq(specialPermissions.userId, userId), notDeleted(specialPermissions)))
	]);

	const permList = (specialPerms.length ? specialPerms : rolePerms).map((p) => p.name);
	return { permList, isSuperAdmin: await computeIsSuperAdmin(permList) };
}

export async function computeIsSuperAdmin(permList: string[]): Promise<boolean> {
	if (!permList.length) return false;

	const [{ total }] = await db.select({ total: count() }).from(permissions);
	// An empty permissions table would otherwise make everyone a super admin.
	if (!total) return false;

	// Deduplicated, so a permission granted twice cannot make up for one that is missing.
	return new Set(permList).size === total;
}
