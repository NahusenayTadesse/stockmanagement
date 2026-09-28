import { eq } from 'drizzle-orm';
import { hasPermission } from '@nahu/admin-kit/server/permissions';
import { db } from '$lib/server/db';
import { category, location, organization } from '$lib/server/db/schema';
import { orgIdOf } from '$lib/server/tenant';
import { countLines, orgCount } from '$lib/server/counts';
import type { PageServerLoad } from './$types';

/** The paper count sheet: counters write the quantity, someone types it in afterwards. */
export const load: PageServerLoad = async ({ params, locals }) => {
	const orgId = orgIdOf(locals);
	const count = await orgCount(orgId, Number(params.id));
	const [[org], [loc], cat, lines] = await Promise.all([
		db
			.select({ name: organization.name, logo: organization.logo })
			.from(organization)
			.where(eq(organization.id, orgId)),
		db.select({ name: location.name }).from(location).where(eq(location.id, count.locationId)),
		count.categoryId
			? db.select({ name: category.name }).from(category).where(eq(category.id, count.categoryId))
			: Promise.resolve([]),
		countLines(orgId, count.id)
	]);
	const showExpected = !count.blind || hasPermission(locals, 'stock.post');
	return {
		count,
		org,
		location: loc.name,
		category: cat[0]?.name ?? null,
		showExpected: showExpected && !count.blind,
		lines: lines.map((l) => ({ ...l, expected: showExpected && !count.blind ? l.expected : null }))
	};
};
