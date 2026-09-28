import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { organization, supplier } from '$lib/server/db/schema';
import { orgIdOf } from '$lib/server/tenant';
import { orderForSupplier } from '$lib/server/purchasing';
import type { PageServerLoad } from './$types';

/** The paper purchase order, to hand or send to the supplier. */
export const load: PageServerLoad = async ({ params, locals }) => {
	const orgId = orgIdOf(locals);
	const { order, details, lines } = await orderForSupplier(orgId, Number(params.id));
	const [[org], [sup]] = await Promise.all([
		db
			.select({ name: organization.name, tin: organization.tin, logo: organization.logo })
			.from(organization)
			.where(eq(organization.id, orgId)),
		db
			.select({ tin: supplier.tin, address: supplier.address })
			.from(supplier)
			.where(eq(supplier.id, order.supplierId))
	]);
	return { order, details, lines, org, supplier: sup };
};
