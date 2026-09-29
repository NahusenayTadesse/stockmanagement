/**
 * The checks an order's or a requisition's header makes on what was picked: the supplier is this
 * business's, and the store is this business's and in one of the viewer's branches. A failed
 * check is a `WriteRefused` on the field, for `attemptForm` to show there.
 */
import { and, eq, isNull } from 'drizzle-orm';
import { WriteRefused } from '@nahu/admin-kit/server/childCrud';
import { db } from '$lib/server/db';
import { location, supplier } from '$lib/server/db/schema';
import { branchScope, inScope } from '$lib/server/scope';

type Locals = App.Locals;

/** The supplier picked, or a refusal on `supplierId`. `activeOnly`: a new order's must be active. */
export async function pickedSupplier(
	orgId: number,
	supplierId: number,
	refusal: string,
	{ activeOnly = false } = {}
) {
	const [sup] = await db
		.select({ id: supplier.id })
		.from(supplier)
		.where(
			and(
				eq(supplier.id, supplierId),
				eq(supplier.orgId, orgId),
				activeOnly ? eq(supplier.isActive, true) : undefined,
				isNull(supplier.deletedAt)
			)
		);
	if (!sup) throw new WriteRefused('supplierId', refusal);
	return sup;
}

/**
 * The store picked, in one of the viewer's branches, or a refusal on `locationId`.
 * `noTransit`: goods in transit are not a store anything can be ordered to or asked from.
 */
export async function pickedStore(
	locals: Locals,
	orgId: number,
	locationId: number,
	refusal: string,
	{ noTransit = false } = {}
) {
	const [loc] = await db
		.select({ id: location.id, branchId: location.branchId, kind: location.kind })
		.from(location)
		.where(and(eq(location.id, locationId), eq(location.orgId, orgId), isNull(location.deletedAt)));
	if (
		!loc ||
		(noTransit && loc.kind === 'transit') ||
		!inScope(await branchScope(locals), loc.branchId)
	) {
		throw new WriteRefused('locationId', refusal);
	}
	return loc;
}
