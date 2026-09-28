/**
 * Reports: stock value now, and what moved, was bought, was lost and was paid over a period.
 * Every query is filtered by the business first; the branch filter narrows by the location's
 * branch (stock) or the transaction's branch (money).
 */
import { and, asc, desc, eq, gt, gte, inArray, isNull, lte, ne, sql } from 'drizzle-orm';
import { formatEthiopianDate, getEthiopianYearMonth } from '@nahu/admin-kit/global';
import { db } from '$lib/server/db';
import { qualified } from '$lib/server/db/sql';
import {
	category,
	item,
	location,
	lot,
	paymentMethod,
	purchaseOrder,
	purchaseOrderLine,
	stockBalance,
	stockDocument,
	stockDocumentLine,
	stockMovement,
	supplier,
	transactions,
	uom
} from '$lib/server/db/schema';
import { round4 } from '$lib/server/stock/math';

export type ReportFilters = { from: string; to: string; branchId: number };

const money = (n: unknown) => Math.round(Number(n) * 100) / 100;
const branchOf = (branchId: number) => (branchId ? eq(location.branchId, branchId) : undefined);

// ── Periods ───────────────────────────────────────────────────────────────────────────────────

/**
 * The buckets a period is drawn in: days for up to two months, Ethiopian months beyond that —
 * the month a business here closes its books by.
 */
export function periodBuckets(from: string, to: string) {
	const days = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000;
	const byDay = days <= 62;
	const noon = (day: string) => new Date(`${day}T12:00:00+03:00`);
	const keyOf = (day: string) => {
		if (byDay) return day;
		const e = getEthiopianYearMonth(noon(day))!;
		return `${e.year}-${String(e.month).padStart(2, '0')}`;
	};
	// "18 መስከረም 2019": the day and month for a day bucket, the month and year for a month bucket.
	const labelOf = (day: string) => {
		const [d, month, year] = formatEthiopianDate(noon(day)).split(' ');
		return byDay ? `${d} ${month}` : `${month} ${year}`;
	};

	const keys: string[] = [];
	const labels: string[] = [];
	for (let d = from; d <= to; d = nextDay(d)) {
		const k = keyOf(d);
		if (keys[keys.length - 1] !== k) {
			keys.push(k);
			labels.push(labelOf(d));
		}
	}
	return { byDay, keys, keyOf, labels };
}

function nextDay(day: string) {
	const d = new Date(`${day}T00:00:00Z`);
	d.setUTCDate(d.getUTCDate() + 1);
	return d.toISOString().slice(0, 10);
}

// ── Stock now ─────────────────────────────────────────────────────────────────────────────────

/** What is on hand now and what it is worth at average cost, by item, category and location. */
export async function stockValuation(orgId: number, branchId: number) {
	const rows = await db
		.select({
			itemId: item.id,
			sku: item.sku,
			item: item.name,
			category: sql<string>`COALESCE(${category.name}, 'Uncategorised')`,
			unit: uom.symbol,
			location: location.name,
			quantity: stockBalance.quantity,
			avgCost: item.avgCost,
			expired: sql<number>`CASE WHEN ${lot.expiryDate} < CURRENT_DATE THEN 1 ELSE 0 END`
		})
		.from(stockBalance)
		.innerJoin(item, eq(item.id, stockBalance.itemId))
		.innerJoin(uom, eq(uom.id, item.baseUomId))
		.innerJoin(location, eq(location.id, stockBalance.locationId))
		.leftJoin(category, eq(category.id, item.categoryId))
		.leftJoin(lot, eq(lot.id, stockBalance.lotId))
		.where(and(eq(stockBalance.orgId, orgId), gt(stockBalance.quantity, 0), branchOf(branchId)));

	const byItem = new Map<
		number,
		{
			itemId: number;
			sku: string;
			item: string;
			category: string;
			unit: string;
			onHand: number;
			avgCost: number;
			value: number;
		}
	>();
	const byCategory = new Map<string, number>();
	const byLocation = new Map<string, number>();
	let expiredValue = 0;

	for (const r of rows) {
		const value = r.quantity * r.avgCost;
		const it = byItem.get(r.itemId) ?? {
			itemId: r.itemId,
			sku: r.sku,
			item: r.item,
			category: r.category,
			unit: r.unit,
			onHand: 0,
			avgCost: r.avgCost,
			value: 0
		};
		it.onHand = round4(it.onHand + r.quantity);
		it.value += value;
		byItem.set(r.itemId, it);
		byCategory.set(r.category, (byCategory.get(r.category) ?? 0) + value);
		byLocation.set(r.location, (byLocation.get(r.location) ?? 0) + value);
		if (Number(r.expired)) expiredValue += value;
	}

	const sorted = (m: Map<string, number>) =>
		[...m]
			.map(([label, value]) => ({ label, value: money(value) }))
			.sort((a, b) => b.value - a.value);
	const items = [...byItem.values()]
		.map((i) => ({ ...i, value: money(i.value) }))
		.sort((a, b) => b.value - a.value);

	return {
		items,
		byCategory: sorted(byCategory),
		byLocation: sorted(byLocation),
		total: money(items.reduce((s, i) => s + i.value, 0)),
		expiredValue: money(expiredValue)
	};
}

// ── Movements over a period ──────────────────────────────────────────────────────────────────

/** Value in and out per bucket, and a summary per kind. Transfers move value, not add it. */
export async function movementsOverTime(orgId: number, f: ReportFilters) {
	const rows = await db
		.select({
			docDate: stockMovement.docDate,
			kind: stockMovement.kind,
			value: sql<number>`SUM(ABS(${stockMovement.quantity}) * ${stockMovement.unitCost})`,
			lines: sql<number>`COUNT(*)`
		})
		.from(stockMovement)
		.innerJoin(location, eq(location.id, stockMovement.locationId))
		.where(
			and(
				eq(stockMovement.orgId, orgId),
				gte(stockMovement.docDate, f.from),
				lte(stockMovement.docDate, f.to),
				branchOf(f.branchId)
			)
		)
		.groupBy(stockMovement.docDate, stockMovement.kind);

	const buckets = periodBuckets(f.from, f.to);
	const index = new Map(buckets.keys.map((k, i) => [k, i]));
	const series = {
		received: buckets.keys.map(() => 0),
		issued: buckets.keys.map(() => 0),
		adjustedOut: buckets.keys.map(() => 0),
		adjustedIn: buckets.keys.map(() => 0)
	};
	const byKind = new Map<string, { value: number; lines: number }>();

	for (const r of rows) {
		const i = index.get(buckets.keyOf(r.docDate));
		const value = Number(r.value);
		const k = byKind.get(r.kind) ?? { value: 0, lines: 0 };
		k.value += value;
		k.lines += Number(r.lines);
		byKind.set(r.kind, k);
		if (i === undefined) continue;
		if (r.kind === 'receipt') series.received[i] += value;
		else if (r.kind === 'issue') series.issued[i] += value;
		else if (r.kind === 'adjustment_out') series.adjustedOut[i] += value;
		else if (r.kind === 'adjustment_in') series.adjustedIn[i] += value;
	}

	const round = (list: number[]) => list.map(money);
	return {
		labels: buckets.labels,
		byDay: buckets.byDay,
		received: round(series.received),
		issued: round(series.issued),
		adjustedOut: round(series.adjustedOut),
		adjustedIn: round(series.adjustedIn),
		byKind: [...byKind].map(([kind, v]) => ({ kind, value: money(v.value), lines: v.lines }))
	};
}

/** The items that went out the most, by value at cost. */
export async function topIssued(orgId: number, f: ReportFilters, limit = 15) {
	const rows = await db
		.select({
			itemId: item.id,
			sku: item.sku,
			item: item.name,
			unit: uom.symbol,
			quantity: sql<number>`SUM(-${stockMovement.quantity})`,
			value: sql<number>`SUM(-${stockMovement.quantity} * ${stockMovement.unitCost})`,
			documents: sql<number>`COUNT(DISTINCT ${stockMovement.documentId})`
		})
		.from(stockMovement)
		.innerJoin(item, eq(item.id, stockMovement.itemId))
		.innerJoin(uom, eq(uom.id, item.baseUomId))
		.innerJoin(location, eq(location.id, stockMovement.locationId))
		.where(
			and(
				eq(stockMovement.orgId, orgId),
				eq(stockMovement.kind, 'issue'),
				gte(stockMovement.docDate, f.from),
				lte(stockMovement.docDate, f.to),
				branchOf(f.branchId)
			)
		)
		.groupBy(item.id, item.sku, item.name, uom.symbol)
		.orderBy(desc(sql`SUM(-${stockMovement.quantity} * ${stockMovement.unitCost})`))
		.limit(limit);
	return rows.map((r) => ({
		...r,
		quantity: round4(Number(r.quantity)),
		value: money(r.value),
		documents: Number(r.documents)
	}));
}

// ── Purchasing ────────────────────────────────────────────────────────────────────────────────

/**
 * Per supplier over the period: what was delivered (posted receipts, at cost), and for orders
 * placed in the period, how much of what was ordered has arrived.
 */
export async function purchasesBySupplier(orgId: number, f: ReportFilters) {
	const delivered = await db
		.select({
			supplierId: supplier.id,
			supplier: supplier.name,
			value: sql<number>`SUM(${stockMovement.quantity} * ${stockMovement.unitCost})`,
			deliveries: sql<number>`COUNT(DISTINCT ${stockMovement.documentId})`
		})
		.from(stockMovement)
		.innerJoin(supplier, eq(supplier.id, stockMovement.supplierId))
		.innerJoin(location, eq(location.id, stockMovement.locationId))
		.where(
			and(
				eq(stockMovement.orgId, orgId),
				eq(stockMovement.kind, 'receipt'),
				gte(stockMovement.docDate, f.from),
				lte(stockMovement.docDate, f.to),
				branchOf(f.branchId)
			)
		)
		.groupBy(supplier.id, supplier.name);

	const receivedOnLine = sql<number>`COALESCE((
		SELECT SUM(${stockDocumentLine.quantity}) FROM ${stockDocumentLine}
		JOIN ${stockDocument} ON ${stockDocument.id} = ${stockDocumentLine.documentId}
		WHERE ${stockDocumentLine.purchaseOrderLineId} = ${qualified(purchaseOrderLine, purchaseOrderLine.id)}
			AND ${stockDocument.status} = 'posted' AND ${stockDocumentLine.deletedAt} IS NULL
	), 0)`;
	const ordered = await db
		.select({
			supplierId: purchaseOrder.supplierId,
			orders: sql<number>`COUNT(DISTINCT ${purchaseOrder.id})`,
			orderedValue: sql<number>`SUM(${purchaseOrderLine.quantity} * COALESCE(${purchaseOrderLine.unitPrice}, 0))`,
			orderedQty: sql<number>`SUM(${purchaseOrderLine.quantity})`,
			receivedQty: sql<number>`SUM(LEAST(${receivedOnLine}, ${purchaseOrderLine.quantity}))`
		})
		.from(purchaseOrderLine)
		.innerJoin(purchaseOrder, eq(purchaseOrder.id, purchaseOrderLine.purchaseOrderId))
		.innerJoin(location, eq(location.id, purchaseOrder.locationId))
		.where(
			and(
				eq(purchaseOrder.orgId, orgId),
				isNull(purchaseOrder.deletedAt),
				isNull(purchaseOrderLine.deletedAt),
				inArray(purchaseOrder.status, ['ordered', 'partially_received', 'received', 'closed']),
				gte(purchaseOrder.orderDate, f.from),
				lte(purchaseOrder.orderDate, f.to),
				branchOf(f.branchId)
			)
		)
		.groupBy(purchaseOrder.supplierId);

	const names = new Map(
		(
			await db
				.select({ id: supplier.id, name: supplier.name })
				.from(supplier)
				.where(eq(supplier.orgId, orgId))
		).map((s) => [s.id, s.name])
	);

	const out = new Map<
		number,
		{
			supplierId: number;
			supplier: string;
			delivered: number;
			deliveries: number;
			orders: number;
			orderedValue: number;
			fillRate: number | null;
		}
	>();
	const row = (id: number) =>
		out.get(id) ??
		out
			.set(id, {
				supplierId: id,
				supplier: names.get(id) ?? '—',
				delivered: 0,
				deliveries: 0,
				orders: 0,
				orderedValue: 0,
				fillRate: null
			})
			.get(id)!;

	for (const d of delivered) {
		const r = row(d.supplierId);
		r.delivered = money(d.value);
		r.deliveries = Number(d.deliveries);
	}
	for (const o of ordered) {
		const r = row(o.supplierId);
		r.orders = Number(o.orders);
		r.orderedValue = money(o.orderedValue);
		const q = Number(o.orderedQty);
		r.fillRate = q > 0 ? Math.round((Number(o.receivedQty) / q) * 1000) / 10 : null;
	}
	return [...out.values()].sort(
		(a, b) => b.delivered - a.delivered || b.orderedValue - a.orderedValue
	);
}

// ── Wastage ───────────────────────────────────────────────────────────────────────────────────

const REASON_NAMES: Record<string, string> = {
	count: 'Count shortage',
	damage: 'Damaged',
	expiry: 'Expired',
	found: 'Found',
	other: 'Other'
};

/** Stock written off over the period: adjustments out, by reason, with every line. */
export async function wastage(orgId: number, f: ReportFilters) {
	const lines = await db
		.select({
			id: stockMovement.id,
			docDate: stockMovement.docDate,
			documentId: stockMovement.documentId,
			number: stockDocument.number,
			reason: sql<string>`COALESCE(${stockDocument.reason}, 'other')`,
			item: item.name,
			sku: item.sku,
			unit: uom.symbol,
			lotNumber: lot.lotNumber,
			location: location.name,
			quantity: sql<number>`-${stockMovement.quantity}`,
			value: sql<number>`-${stockMovement.quantity} * ${stockMovement.unitCost}`
		})
		.from(stockMovement)
		.innerJoin(stockDocument, eq(stockDocument.id, stockMovement.documentId))
		.innerJoin(item, eq(item.id, stockMovement.itemId))
		.innerJoin(uom, eq(uom.id, item.baseUomId))
		.innerJoin(location, eq(location.id, stockMovement.locationId))
		.leftJoin(lot, eq(lot.id, stockMovement.lotId))
		.where(
			and(
				eq(stockMovement.orgId, orgId),
				eq(stockMovement.kind, 'adjustment_out'),
				gte(stockMovement.docDate, f.from),
				lte(stockMovement.docDate, f.to),
				branchOf(f.branchId)
			)
		)
		.orderBy(desc(stockMovement.docDate), desc(stockMovement.id));

	const rows = lines.map((l) => ({
		...l,
		reasonName: REASON_NAMES[l.reason] ?? l.reason,
		quantity: round4(Number(l.quantity)),
		value: money(l.value)
	}));
	const byReason = new Map<string, number>();
	for (const r of rows) byReason.set(r.reasonName, (byReason.get(r.reasonName) ?? 0) + r.value);

	return {
		rows,
		byReason: [...byReason].map(([label, value]) => ({ label, value: money(value) })),
		total: money(rows.reduce((s, r) => s + r.value, 0))
	};
}

// ── Money ─────────────────────────────────────────────────────────────────────────────────────

/** Money in and out per bucket, by purpose and by method. Voided transactions left out. */
export async function moneyOverTime(orgId: number, f: ReportFilters) {
	const rows = await db
		.select({
			occurredOn: transactions.occurredOn,
			direction: transactions.direction,
			purpose: transactions.purpose,
			method: sql<string>`COALESCE(${paymentMethod.name}, 'Unspecified')`,
			amount: sql<number>`SUM(${transactions.amount})`
		})
		.from(transactions)
		.leftJoin(paymentMethod, eq(paymentMethod.id, transactions.paymentMethodId))
		.where(
			and(
				eq(transactions.orgId, orgId),
				isNull(transactions.deletedAt),
				ne(transactions.status, 'void'),
				gte(transactions.occurredOn, f.from),
				lte(transactions.occurredOn, f.to),
				f.branchId ? eq(transactions.branchId, f.branchId) : undefined
			)
		)
		.groupBy(
			transactions.occurredOn,
			transactions.direction,
			transactions.purpose,
			paymentMethod.name
		)
		.orderBy(asc(transactions.occurredOn));

	const buckets = periodBuckets(f.from, f.to);
	const index = new Map(buckets.keys.map((k, i) => [k, i]));
	const moneyIn = buckets.keys.map(() => 0);
	const moneyOut = buckets.keys.map(() => 0);
	const byPurpose = new Map<string, { in: number; out: number }>();
	const byMethod = new Map<string, { in: number; out: number }>();

	for (const r of rows) {
		const amount = Number(r.amount);
		const i = index.get(buckets.keyOf(r.occurredOn));
		if (i !== undefined) (r.direction === 'in' ? moneyIn : moneyOut)[i] += amount;
		for (const [map, key] of [
			[byPurpose, r.purpose],
			[byMethod, r.method]
		] as const) {
			const v = map.get(key) ?? { in: 0, out: 0 };
			v[r.direction] += amount;
			map.set(key, v);
		}
	}

	const table = (m: Map<string, { in: number; out: number }>) =>
		[...m]
			.map(([label, v]) => ({
				label,
				in: money(v.in),
				out: money(v.out),
				net: money(v.in - v.out)
			}))
			.sort((a, b) => b.in + b.out - (a.in + a.out));

	return {
		labels: buckets.labels,
		moneyIn: moneyIn.map(money),
		moneyOut: moneyOut.map(money),
		byPurpose: table(byPurpose),
		byMethod: table(byMethod),
		totalIn: money(moneyIn.reduce((s, v) => s + v, 0)),
		totalOut: money(moneyOut.reduce((s, v) => s + v, 0))
	};
}
