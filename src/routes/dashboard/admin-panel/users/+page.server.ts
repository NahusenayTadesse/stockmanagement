import { and, eq } from 'drizzle-orm';
import { notDeleted } from '@nahu/admin-kit/server/softDelete';
import { db } from '$lib/server/db';
import { branch, roles, user } from '$lib/server/db/schema';
import { orgIdOf } from '$lib/server/tenant';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const userList = await db
		.select({
			id: user.id,
			name: user.name,
			email: user.email,
			roleId: user.roleId,
			role: roles.name,
			branch: branch.name,
			status: user.isActive,
			createdAt: user.createdAt
		})
		.from(user)
		.leftJoin(roles, eq(roles.id, user.roleId))
		.leftJoin(branch, eq(branch.id, user.branchId))
		.where(and(eq(user.orgId, orgIdOf(locals)), notDeleted(user)))
		.orderBy(user.name);

	return { userList };
};
