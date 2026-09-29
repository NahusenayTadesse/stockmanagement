import { and, desc, eq } from 'drizzle-orm';
import { hasPermission } from '@nahu/admin-kit/server/permissions';
import { db } from '$lib/server/db';
import { location, posShift, user } from '$lib/server/db/schema';
import { orgIdOf } from '$lib/server/tenant';
import type { PageServerLoad } from './$types';

/** Till shifts: a cashier sees their own; someone with `pos.manage`, everyone's. */
export const load: PageServerLoad = async ({ locals }) => {
	const orgId = orgIdOf(locals);
	const all = hasPermission(locals, 'pos.manage');
	const rows = await db
		.select({
			id: posShift.id,
			status: posShift.status,
			cashier: user.name,
			location: location.name,
			openedAt: posShift.openedAt,
			closedAt: posShift.closedAt,
			openingFloat: posShift.openingFloat,
			expectedCash: posShift.expectedCash,
			countedCash: posShift.countedCash
		})
		.from(posShift)
		.innerJoin(user, eq(user.id, posShift.userId))
		.innerJoin(location, eq(location.id, posShift.locationId))
		.where(and(eq(posShift.orgId, orgId), all ? undefined : eq(posShift.userId, locals.user!.id)))
		.orderBy(desc(posShift.id))
		.limit(500);
	return {
		shifts: rows.map((r) => ({
			...r,
			difference:
				r.countedCash !== null && r.expectedCash !== null
					? Math.round((r.countedCash - r.expectedCash) * 100) / 100
					: null
		})),
		all
	};
};
