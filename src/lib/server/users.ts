/**
 * Rules for managing people and roles inside one business, shared by the Users and Roles screens.
 */
import { and, count, eq, inArray, isNull, ne, sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { account, permissions, roles, session, user } from '$lib/server/db/schema';
import { auth } from '$lib/server/auth';
import type { Tx } from '$lib/server/stock/post';

/** The permission checklist: every permission, worded. */
export const permissionOptions = () =>
	db
		.select({
			value: permissions.id,
			name: sql<string>`COALESCE(${permissions.description}, ${permissions.name})`,
			description: permissions.name
		})
		.from(permissions)
		.orderBy(permissions.name);

/**
 * Whether the viewer may hand out these permissions. You can only grant what you hold yourself;
 * otherwise anyone who may manage roles or users could give themselves everything. A super admin
 * holds everything, so is never refused.
 *
 * Returns the names the viewer does not hold, empty when the grant is fine, or null when an id
 * is not a permission at all.
 */
export async function ungrantable(
	locals: App.Locals,
	permissionIds: number[]
): Promise<string[] | null> {
	if (!permissionIds.length) return [];
	const rows = await db
		.select({ id: permissions.id, name: permissions.name })
		.from(permissions)
		.where(inArray(permissions.id, permissionIds));
	if (rows.length !== new Set(permissionIds).size) return null;
	if (locals.isSuperAdmin) return [];
	return rows.map((r) => r.name).filter((name) => !locals.permList.includes(name));
}

/** Active, undeleted users on the business's owner role, optionally leaving one out. */
export async function activeOwnerCount(orgId: number, excludingUserId?: string) {
	const [{ total }] = await db
		.select({ total: count() })
		.from(user)
		.innerJoin(roles, eq(roles.id, user.roleId))
		.where(
			and(
				eq(user.orgId, orgId),
				eq(roles.isOwner, true),
				eq(user.isActive, true),
				isNull(user.deletedAt),
				excludingUserId ? ne(user.id, excludingUserId) : undefined
			)
		);
	return Number(total);
}

/** A role of this business, or undefined. */
export async function orgRole(orgId: number, roleId: number) {
	const [row] = await db
		.select()
		.from(roles)
		.where(and(eq(roles.id, roleId), eq(roles.orgId, orgId), isNull(roles.deletedAt)))
		.limit(1);
	return row;
}

/** Ends every session a user holds, so a change to what they may do bites on their next click. */
export async function revokeSessions(tx: Tx, userId: string) {
	await tx.delete(session).where(eq(session.userId, userId));
}

/**
 * Sets a user's password without knowing the old one — for an administrator, when email resets
 * are not an option. Hashed by better-auth's own hasher, so sign-in reads it like any other.
 */
export async function setPassword(userId: string, password: string) {
	const ctx = await auth.$context;
	const hash = await ctx.password.hash(password);
	await db.transaction(async (tx) => {
		await tx
			.update(account)
			.set({ password: hash })
			.where(and(eq(account.userId, userId), eq(account.providerId, 'credential')));
		await revokeSessions(tx, userId);
	});
}
