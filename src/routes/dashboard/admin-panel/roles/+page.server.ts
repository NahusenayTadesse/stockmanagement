import { and, countDistinct, eq } from 'drizzle-orm';
import { notDeleted } from '@nahu/admin-kit/server/softDelete';
import { db } from '$lib/server/db';
import { rolePermissions, roles, user } from '$lib/server/db/schema';
import { orgIdOf } from '$lib/server/tenant';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const roleList = await db
		.select({
			id: roles.id,
			name: roles.name,
			description: roles.description,
			isOwner: roles.isOwner,
			status: roles.isActive,
			userCount: countDistinct(user.id),
			permissionsCount: countDistinct(rolePermissions.id)
		})
		.from(roles)
		.leftJoin(user, and(eq(user.roleId, roles.id), eq(user.isActive, true), notDeleted(user)))
		.leftJoin(
			rolePermissions,
			and(eq(rolePermissions.roleId, roles.id), notDeleted(rolePermissions))
		)
		.where(and(eq(roles.orgId, orgIdOf(locals)), notDeleted(roles)))
		.groupBy(roles.id)
		.orderBy(roles.name);

	return { roleList };
};
