/**
 * Reading stock. Every function takes the organization and filters by it first; none reads a
 * value from the request.
 */
import { and, asc, desc, eq, gt, isNull, lte, sql } from 'drizzle-orm';
import { localToday, addLocalDays } from '@nahu/admin-kit/time';
import { db } from '$lib/server/db';
import { qualified } from '$lib/server/db/sql';
import {
	branch,
	category,
	item,
	location,
	lot,
	stockBalance,
	stockDocument,
	stockMovement,
	uom
} from '$lib/server/db/schema';

/** Everything on hand, one row per location, item and lot, with its value at average cost. */
export async function onHandRows(orgId: number, filter: { itemId?: number } = {}) {
	return db
		.select({
			itemId: item.id,
			sku: item.sku,
			item: item.name,
			category: category.name,
			unit: uom.symbol,
			branch: branch.name,
			locationId: location.id,
			location: location.name,
			locationKind: location.kind,
			lotId: lot.id,
			lotNumber: lot.lotNumber,
			expiryDate: lot.expiryDate,
			lotStatus: lot.status,
			warningDays: sql<number>`COALESCE(${category.expiryWarningDays}, 90)`,
			quantity: stockBalance.quantity,
			value: sql<number>`ROUND(${stockBalance.quantity} * ${item.avgCost}, 2)`
		})
		.from(stockBalance)
		.innerJoin(item, eq(item.id, stockBalance.itemId))
		.innerJoin(uom, eq(uom.id, item.baseUomId))
		.innerJoin(location, eq(location.id, stockBalance.locationId))
		.innerJoin(branch, eq(branch.id, location.branchId))
		.leftJoin(category, eq(category.id, item.categoryId))
		.leftJoin(lot, eq(lot.id, stockBalance.lotId))
		.where(
			and(
				eq(stockBalance.orgId, orgId),
				gt(stockBalance.quantity, 0),
				filter.itemId ? eq(stockBalance.itemId, filter.itemId) : undefined
			)
		)
		.orderBy(
			asc(item.name),
			asc(location.name),
			sql`${lot.expiryDate} IS NULL`,
			asc(lot.expiryDate)
		);
}

/** Total on hand per item, as a correlated subquery that drops into any select over `item`. */
export const itemOnHand = sql<number>`(
	SELECT COALESCE(SUM(${stockBalance.quantity}), 0) FROM ${stockBalance}
	WHERE ${stockBalance.itemId} = ${qualified(item, item.id)}
)`;

/**
 * Lots with stock, and how much of each is left. Expired ones included — they are the ones that
 * need doing something about.
 */
export async function lotRows(orgId: number) {
	return db
		.select({
			id: lot.id,
			lotNumber: lot.lotNumber,
			expiryDate: lot.expiryDate,
			status: lot.status,
			note: lot.note,
			itemId: item.id,
			item: item.name,
			unit: uom.symbol,
			warningDays: sql<number>`COALESCE(${category.expiryWarningDays}, 90)`,
			onHand: sql<number>`COALESCE(SUM(${stockBalance.quantity}), 0)`,
			value: sql<number>`ROUND(COALESCE(SUM(${stockBalance.quantity}), 0) * ${item.avgCost}, 2)`
		})
		.from(lot)
		.innerJoin(item, eq(item.id, lot.itemId))
		.innerJoin(uom, eq(uom.id, item.baseUomId))
		.leftJoin(category, eq(category.id, item.categoryId))
		.leftJoin(stockBalance, eq(stockBalance.lotId, lot.id))
		.where(eq(lot.orgId, orgId))
		.groupBy(lot.id)
		.orderBy(sql`${lot.expiryDate} IS NULL`, asc(lot.expiryDate));
}

/** The numbers on the dashboard. */
export async function dashboardStats(orgId: number) {
	const today = localToday();

	const [[value], [items], [drafts], expiring, lowStock, recent] = await Promise.all([
		db
			.select({ total: sql<number>`COALESCE(SUM(${stockBalance.quantity} * ${item.avgCost}), 0)` })
			.from(stockBalance)
			.innerJoin(item, eq(item.id, stockBalance.itemId))
			.where(eq(stockBalance.orgId, orgId)),
		db
			.select({ total: sql<number>`COUNT(*)` })
			.from(item)
			.where(and(eq(item.orgId, orgId), isNull(item.deletedAt))),
		db
			.select({ total: sql<number>`COUNT(*)` })
			.from(stockDocument)
			.where(and(eq(stockDocument.orgId, orgId), eq(stockDocument.status, 'draft'))),

		// Lots with stock whose expiry falls inside their category's warning window, or has passed.
		db
			.select({
				lotId: lot.id,
				lotNumber: lot.lotNumber,
				expiryDate: lot.expiryDate,
				itemId: item.id,
				item: item.name,
				unit: uom.symbol,
				warningDays: sql<number>`COALESCE(${category.expiryWarningDays}, 90)`,
				onHand: sql<number>`SUM(${stockBalance.quantity})`,
				value: sql<number>`ROUND(SUM(${stockBalance.quantity}) * ${item.avgCost}, 2)`
			})
			.from(lot)
			.innerJoin(item, eq(item.id, lot.itemId))
			.innerJoin(uom, eq(uom.id, item.baseUomId))
			.leftJoin(category, eq(category.id, item.categoryId))
			.innerJoin(stockBalance, and(eq(stockBalance.lotId, lot.id), gt(stockBalance.quantity, 0)))
			.where(
				and(
					eq(lot.orgId, orgId),
					sql`${lot.expiryDate} <= DATE_ADD(${today}, INTERVAL COALESCE(${category.expiryWarningDays}, 90) DAY)`
				)
			)
			.groupBy(lot.id)
			.orderBy(asc(lot.expiryDate))
			.limit(50),

		db
			.select({
				id: item.id,
				sku: item.sku,
				name: item.name,
				unit: uom.symbol,
				reorderLevel: item.reorderLevel,
				onHand: itemOnHand
			})
			.from(item)
			.innerJoin(uom, eq(uom.id, item.baseUomId))
			.where(
				and(
					eq(item.orgId, orgId),
					isNull(item.deletedAt),
					eq(item.isActive, true),
					eq(item.stockTracked, true),
					sql`${item.reorderLevel} IS NOT NULL`,
					lte(itemOnHand, item.reorderLevel)
				)
			)
			.orderBy(asc(item.name))
			.limit(50),

		db
			.select({
				id: stockDocument.id,
				number: stockDocument.number,
				type: stockDocument.type,
				status: stockDocument.status,
				docDate: stockDocument.docDate,
				party: stockDocument.party
			})
			.from(stockDocument)
			.where(eq(stockDocument.orgId, orgId))
			.orderBy(desc(stockDocument.id))
			.limit(8)
	]);

	const expired = expiring.filter((l) => l.expiryDate! < today);

	return {
		stockValue: Number(value.total),
		itemCount: Number(items.total),
		draftCount: Number(drafts.total),
		expiredValue: expired.reduce((sum, l) => sum + Number(l.value), 0),
		expiring: expiring.map((l) => ({ ...l, expired: l.expiryDate! < today })),
		expiringSoonCount: expiring.length - expired.length,
		expiredCount: expired.length,
		lowStock,
		recent,
		// For "expires within" wording on the page.
		horizon: addLocalDays(today, 90)
	};
}

/**
 * The bin card: every movement of one item, oldest first, with the balance after each. The
 * running balance is computed over *all* locations here; `locationId` narrows it to one.
 */
export async function binCard(orgId: number, itemId: number, locationId?: number) {
	const rows = await db
		.select({
			id: stockMovement.id,
			docDate: stockMovement.docDate,
			createdAt: stockMovement.createdAt,
			kind: stockMovement.kind,
			quantity: stockMovement.quantity,
			unitCost: stockMovement.unitCost,
			location: location.name,
			lotNumber: lot.lotNumber,
			documentId: stockDocument.id,
			number: stockDocument.number,
			party: stockDocument.party,
			reference: stockDocument.reference
		})
		.from(stockMovement)
		.innerJoin(location, eq(location.id, stockMovement.locationId))
		.innerJoin(stockDocument, eq(stockDocument.id, stockMovement.documentId))
		.leftJoin(lot, eq(lot.id, stockMovement.lotId))
		.where(
			and(
				eq(stockMovement.orgId, orgId),
				eq(stockMovement.itemId, itemId),
				locationId ? eq(stockMovement.locationId, locationId) : undefined
			)
		)
		.orderBy(asc(stockMovement.id));

	let balance = 0;
	return rows.map((row) => {
		balance = Math.round((balance + Number(row.quantity)) * 1e4) / 1e4;
		return { ...row, balance };
	});
}
