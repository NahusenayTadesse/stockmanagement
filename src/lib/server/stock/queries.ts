/**
 * Reading stock. Every function takes the organization and filters by it first; none reads a
 * value from the request.
 */
import { and, asc, desc, eq, gt, inArray, isNull, lte, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/mysql-core';
import { scopeWhere, type Scope } from '$lib/server/scope';
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
import { round4 } from '$lib/money';

/**
 * Everything on hand, one row per location, item and lot, with its value at average cost. Stock
 * on the road between branches is on hand too, at the receiving branch's transit location.
 * `branchIds` narrows it to the viewer's branches.
 */
export async function onHandRows(
	orgId: number,
	filter: { itemId?: number; branchIds?: number[] | null } = {}
) {
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
				filter.itemId ? eq(stockBalance.itemId, filter.itemId) : undefined,
				filter.branchIds
					? filter.branchIds.length
						? inArray(location.branchId, filter.branchIds)
						: eq(location.id, -1)
					: undefined
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
export async function lotRows(orgId: number, scope: Scope = null) {
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
		.leftJoin(location, eq(location.id, stockBalance.locationId))
		.where(and(eq(lot.orgId, orgId), scopeWhere(scope, location.branchId)))
		.groupBy(lot.id)
		.orderBy(sql`${lot.expiryDate} IS NULL`, asc(lot.expiryDate));
}

/**
 * Dashboard stock is limited to the viewer's branches. The catalog itself is shared by the
 * organization. Count full result sets independently of the bounded lists shown on the page.
 */
export async function dashboardStats(
	orgId: number,
	scope: Scope,
	reader: Pick<typeof db, 'select'> = db,
	preview = { limit: 50, offset: 0 }
) {
	const today = localToday();
	const fromLoc = alias(location, 'dashboard_from');
	const toLoc = alias(location, 'dashboard_to');
	const documentWhere = and(
		eq(stockDocument.orgId, orgId),
		isNull(stockDocument.deletedAt),
		scopeWhere(scope, stockDocument.branchId, fromLoc.branchId, toLoc.branchId)
	);

	// Group before counting so a lot split over several permitted locations counts once.
	const expiryRows = reader
		.select({
			lotId: sql<number>`${lot.id}`.as('lot_id'),
			lotNumber: lot.lotNumber,
			expiryDate: lot.expiryDate,
			itemId: sql<number>`${item.id}`.as('item_id'),
			item: item.name,
			unit: uom.symbol,
			warningDays: sql<number>`COALESCE(${category.expiryWarningDays}, 90)`.as('warning_days'),
			onHand: sql<number>`SUM(${stockBalance.quantity})`.as('on_hand'),
			value: sql<number>`ROUND(SUM(${stockBalance.quantity}) * ${item.avgCost}, 2)`.as('value')
		})
		.from(lot)
		.innerJoin(item, eq(item.id, lot.itemId))
		.innerJoin(uom, eq(uom.id, item.baseUomId))
		.leftJoin(category, eq(category.id, item.categoryId))
		.innerJoin(stockBalance, and(eq(stockBalance.lotId, lot.id), gt(stockBalance.quantity, 0)))
		.innerJoin(location, eq(location.id, stockBalance.locationId))
		.where(
			and(
				eq(lot.orgId, orgId),
				scopeWhere(scope, location.branchId),
				sql`${lot.expiryDate} <= DATE_ADD(${today}, INTERVAL COALESCE(${category.expiryWarningDays}, 90) DAY)`
			)
		)
		.groupBy(lot.id)
		.as('dashboard_expiry');

	const onHand = sql<number>`(
		SELECT COALESCE(SUM(${stockBalance.quantity}), 0)
		FROM ${stockBalance}
		INNER JOIN ${location} ON ${location.id} = ${stockBalance.locationId}
		WHERE ${stockBalance.orgId} = ${orgId}
			AND ${stockBalance.itemId} = ${qualified(item, item.id)}
			AND ${scopeWhere(scope, location.branchId) ?? sql`TRUE`}
	)`;
	const lowStockWhere = and(
		eq(item.orgId, orgId),
		isNull(item.deletedAt),
		eq(item.isActive, true),
		eq(item.stockTracked, true),
		sql`${item.reorderLevel} IS NOT NULL`,
		lte(onHand, item.reorderLevel),
		// An explicitly empty scope means no stock access, not zero stock for every item.
		scope !== null && scope.length === 0 ? sql`FALSE` : undefined
	);

	const [[value], [items], [drafts], [expiryTotals], expiring, [lowTotal], lowStock, recent] =
		await Promise.all([
			reader
				.select({
					total: sql<number>`COALESCE(SUM(${stockBalance.quantity} * ${item.avgCost}), 0)`
				})
				.from(stockBalance)
				.innerJoin(item, eq(item.id, stockBalance.itemId))
				.innerJoin(location, eq(location.id, stockBalance.locationId))
				.where(and(eq(stockBalance.orgId, orgId), scopeWhere(scope, location.branchId))),
			reader
				.select({ total: sql<number>`COUNT(*)` })
				.from(item)
				.where(and(eq(item.orgId, orgId), isNull(item.deletedAt))),
			reader
				.select({ total: sql<number>`COUNT(*)` })
				.from(stockDocument)
				.leftJoin(fromLoc, eq(fromLoc.id, stockDocument.fromLocationId))
				.leftJoin(toLoc, eq(toLoc.id, stockDocument.toLocationId))
				.where(and(documentWhere, eq(stockDocument.status, 'draft'))),
			reader
				.select({
					expired: sql<number>`COALESCE(SUM(${expiryRows.expiryDate} < ${today}), 0)`,
					soon: sql<number>`COALESCE(SUM(${expiryRows.expiryDate} >= ${today}), 0)`,
					expiredValue: sql<number>`COALESCE(SUM(CASE WHEN ${expiryRows.expiryDate} < ${today} THEN ${expiryRows.value} ELSE 0 END), 0)`
				})
				.from(expiryRows),
			reader
				.select()
				.from(expiryRows)
				.orderBy(asc(expiryRows.expiryDate), asc(expiryRows.lotId))
				.limit(preview.limit).offset(preview.offset),
			reader
				.select({ total: sql<number>`COUNT(*)` })
				.from(item)
				.where(lowStockWhere),
			reader
				.select({
					id: item.id,
					sku: item.sku,
					name: item.name,
					unit: uom.symbol,
					reorderLevel: item.reorderLevel,
					onHand
				})
				.from(item)
				.innerJoin(uom, eq(uom.id, item.baseUomId))
				.where(lowStockWhere)
				.orderBy(asc(item.name), asc(item.id))
				.limit(preview.limit).offset(preview.offset),
			reader
				.select({
					id: stockDocument.id,
					number: stockDocument.number,
					type: stockDocument.type,
					status: stockDocument.status,
					docDate: stockDocument.docDate,
					party: stockDocument.party
				})
				.from(stockDocument)
				.leftJoin(fromLoc, eq(fromLoc.id, stockDocument.fromLocationId))
				.leftJoin(toLoc, eq(toLoc.id, stockDocument.toLocationId))
				.where(documentWhere)
				.orderBy(desc(stockDocument.id))
				.limit(8)
		]);

	return {
		stockValue: Number(value.total),
		itemCount: Number(items.total),
		draftCount: Number(drafts.total),
		expiredValue: Number(expiryTotals.expiredValue),
		expiring: expiring.map((l) => ({ ...l, expired: l.expiryDate! < today })),
		expiringSoonCount: Number(expiryTotals.soon),
		expiredCount: Number(expiryTotals.expired),
		lowStockCount: Number(lowTotal.total),
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
export async function binCard(orgId: number, itemId: number, locationId?: number, scope: Scope = null) {
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
				scopeWhere(scope, location.branchId),
				locationId ? eq(stockMovement.locationId, locationId) : undefined
			)
		)
		.orderBy(asc(stockMovement.id));

	let balance = 0;
	return rows.map((row) => {
		balance = round4(balance + Number(row.quantity));
		return { ...row, balance };
	});
}
