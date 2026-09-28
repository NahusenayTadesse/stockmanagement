/**
 * Picker options (`{ value, name }[]`), always of the viewer's own business, active and not
 * deleted. The load of any form that offers a choice calls these; the matching action checks the
 * chosen id belongs to the business too (`belongsToOrg`), because a form can post any id.
 */
import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import { WriteRefused } from '@nahu/admin-kit/server/childCrud';
import type { AnyMySqlColumn, MySqlTable } from 'drizzle-orm/mysql-core';
import { db } from '$lib/server/db';
import {
	branch,
	category,
	item,
	location,
	lot,
	paymentMethod,
	roles,
	supplier,
	uom
} from '$lib/server/db/schema';

export const branchOptions = (orgId: number) =>
	db
		.select({ value: branch.id, name: branch.name })
		.from(branch)
		.where(and(eq(branch.orgId, orgId), eq(branch.status, true), isNull(branch.deletedAt)))
		.orderBy(asc(branch.name));

export const locationOptions = (orgId: number) =>
	db
		.select({
			value: location.id,
			name: sql<string>`CONCAT(${branch.name}, ' · ', ${location.name})`,
			branchId: location.branchId,
			kind: location.kind
		})
		.from(location)
		.innerJoin(branch, eq(branch.id, location.branchId))
		.where(and(eq(location.orgId, orgId), eq(location.status, true), isNull(location.deletedAt)))
		.orderBy(asc(branch.name), asc(location.name));

export const categoryOptions = (orgId: number) =>
	db
		.select({ value: category.id, name: category.name })
		.from(category)
		.where(and(eq(category.orgId, orgId), eq(category.status, true), isNull(category.deletedAt)))
		.orderBy(asc(category.name));

export const unitOptions = (orgId: number) =>
	db
		.select({ value: uom.id, name: sql<string>`CONCAT(${uom.name}, ' (', ${uom.symbol}, ')')` })
		.from(uom)
		.where(and(eq(uom.orgId, orgId), eq(uom.status, true), isNull(uom.deletedAt)))
		.orderBy(asc(uom.name));

export const itemOptions = (orgId: number) =>
	db
		.select({ value: item.id, name: sql<string>`CONCAT(${item.name}, ' — ', ${item.sku})` })
		.from(item)
		.where(
			and(
				eq(item.orgId, orgId),
				eq(item.isActive, true),
				eq(item.stockTracked, true),
				isNull(item.deletedAt)
			)
		)
		.orderBy(asc(item.name));

/** Lots that still exist in some quantity, labelled with their item and expiry. */
export const lotOptions = (orgId: number) =>
	db
		.select({
			value: lot.id,
			name: sql<string>`CONCAT(${item.name}, ' · lot ', ${lot.lotNumber}, COALESCE(CONCAT(' · exp ', ${lot.expiryDate}), ''))`
		})
		.from(lot)
		.innerJoin(item, eq(item.id, lot.itemId))
		.where(eq(lot.orgId, orgId))
		.orderBy(asc(item.name), asc(lot.expiryDate));

export const methodOptions = (orgId: number) =>
	db
		.select({ value: paymentMethod.id, name: paymentMethod.name })
		.from(paymentMethod)
		.where(
			and(
				eq(paymentMethod.orgId, orgId),
				eq(paymentMethod.status, true),
				isNull(paymentMethod.deletedAt)
			)
		)
		.orderBy(asc(paymentMethod.name));

/** Active suppliers, labelled with their phone so two of the same name can be told apart. */
export const supplierOptions = (orgId: number) =>
	db
		.select({
			value: supplier.id,
			name: sql<string>`CONCAT(${supplier.name}, IF(${supplier.phone} = '', '', CONCAT(' · ', ${supplier.phone})))`
		})
		.from(supplier)
		.where(and(eq(supplier.orgId, orgId), eq(supplier.isActive, true), isNull(supplier.deletedAt)))
		.orderBy(asc(supplier.name));

export const roleOptions = (orgId: number) =>
	db
		.select({ value: roles.id, name: roles.name })
		.from(roles)
		.where(and(eq(roles.orgId, orgId), eq(roles.isActive, true), isNull(roles.deletedAt)))
		.orderBy(asc(roles.name));

/**
 * Refuses the write unless `id` is a row of this business. For foreign keys posted by a form:
 * without it, a crafted request could file a location under another business's branch.
 */
export async function belongsToOrg(
	table: MySqlTable & { id: AnyMySqlColumn; orgId: AnyMySqlColumn },
	id: unknown,
	orgId: number,
	field: string,
	label: string
) {
	if (id === null || id === undefined || id === '' || id === 0) return;
	const [row] = await db
		.select({ id: table.id })
		.from(table)
		.where(and(eq(table.id, Number(id)), eq(table.orgId, orgId)))
		.limit(1);
	if (!row) throw new WriteRefused(field, `Choose a ${label} from the list.`);
}
