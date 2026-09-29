import { and, eq } from 'drizzle-orm';
import { notDeleted } from '@nahu/admin-kit/server/softDelete';
import { db } from '$lib/server/db';
import { branch, roles, user } from '$lib/server/db/schema';
import { orgIdOf } from '$lib/server/tenant';
import { branchesByUser } from '$lib/server/users';
import type { PageServerLoad } from './$types';
import { m } from '$lib/paraglide/messages.js';

export const load: PageServerLoad = async ({ locals }) => {
	const orgId = orgIdOf(locals);
	const rows = await db
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
		.where(and(eq(user.orgId, orgId), notDeleted(user)))
		.orderBy(user.name);

	const works = await branchesByUser(orgId);
	const userList = rows.map((r) => ({
		...r,
		worksIn:
			works
				.get(r.id)
				?.map((b) => b.name)
				.join(', ') || m.admin_users_all_branches()
	}));
	return { userList };
};
