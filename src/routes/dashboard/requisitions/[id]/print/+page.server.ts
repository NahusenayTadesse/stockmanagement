import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { organization } from '$lib/server/db/schema';
import { orgIdOf } from '$lib/server/tenant';
import { requireBranch } from '$lib/server/scope';
import { orgRequisition, requisitionDetail, requisitionLines } from '$lib/server/requisitions';
import type { PageServerLoad } from './$types';

/** The paper requisition, signed by whoever asked, approved, issued and received. */
export const load: PageServerLoad = async ({ params, locals }) => {
	const orgId = orgIdOf(locals);
	const req = await orgRequisition(orgId, Number(params.id));
	await requireBranch(locals, req.branchId);
	const [details, lines, [org]] = await Promise.all([
		requisitionDetail(orgId, req.id),
		requisitionLines(orgId, req.id),
		db
			.select({ name: organization.name, tin: organization.tin, logo: organization.logo })
			.from(organization)
			.where(eq(organization.id, orgId))
	]);
	return { req, details, lines, org };
};
