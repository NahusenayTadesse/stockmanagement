/**
 * Stock analysis, read off the ledger: what is not moving, which few items carry the value (ABC),
 * when shelves ran empty, how an item's stock rose and fell, and where one serial number has been.
 *
 * Every function is scoped by the business first, then by the locations it is given — the
 * caller works those out from the branch filter and the viewer's branch scope (`locationsFor`).
 */
import { and, asc, eq, gte, inArray, isNull, like, lt, lte, or, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/mysql-core';
import { formatEthiopianDate, getEthiopianYearMonth } from '@nahu/admin-kit/global';
import { db } from '$lib/server/db';
import {
	branch,
	category,
	customer,
	item,
	location,
	lot,
	reorderRule,
	serialUnit,
	stockBalance,
	stockDocument,
	stockDocumentLine,
	stockMovement,
	supplier,
	uom
} from '$lib/server/db/schema';
import { round4 } from '$lib/server/stock/math';

type Reader = Pick<typeof db, 'select'>;

const DAY = 86_400_000;
const money = (n: unknown) => Math.round(Number(n) * 100) / 100;
/** Whole days from `a` to `b`, both `YYYY-MM-DD`. */
export const daysBetween = (a: string, b: string) =>
	Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY);
const nextDay = (day: string) =>
	new Date(Date.parse(`${day}T00:00:00Z`) + DAY).toISOString().slice(0, 10);
const noon = (day: string) => new Date(`${day}T12:00:00+03:00`);
export const ethiopianDay = (day: string) => formatEthiopianDate(noon(day));

// ── Which locations ───────────────────────────────────────────────────────────────────────────

/**
 * The business's locations a report looks at: narrowed to the viewer's branches, then to a chosen
 * branch or location. `shelvesOnly` leaves out transit and quarantine locations — stock there is
 * not on a shelf to be sold or used, so it neither makes a shelf "in stock" nor "out".
 */
export async function locationsFor(
	orgId: number,
	f: {
		scope: number[] | null;
		branchId?: number;
		locationId?: number;
		shelvesOnly?: boolean;
	},
	reader: Reader = db
): Promise<number[]> {
	const rows = await reader
		.select({ id: location.id, branchId: location.branchId, kind: location.kind })
		.from(location)
		.where(and(eq(location.orgId, orgId), isNull(location.deletedAt)));
	return rows
		.filter((l) => f.scope === null || f.scope.includes(l.branchId))
		.filter((l) => !f.branchId || l.branchId === f.branchId)
		.filter((l) => !f.locationId || l.id === f.locationId)
		.filter((l) => !f.shelvesOnly || (l.kind !== 'transit' && l.kind !== 'quarantine'))
		.map((l) => l.id);
}

/** Locations to offer in a report's filter: the viewer's, labelled with their branch. */
export async function reportLocations(orgId: number, scope: number[] | null) {
	const rows = await db
		.select({
			value: location.id,
			name: sql<string>`CONCAT(${branch.name}, ' · ', ${location.name})`,
			branchId: location.branchId
		})
		.from(location)
		.innerJoin(branch, eq(branch.id, location.branchId))
		.where(and(eq(location.orgId, orgId), isNull(location.deletedAt)))
		.orderBy(asc(branch.name), asc(location.name));
	return rows.filter((r) => scope === null || scope.includes(r.branchId));
}

// ── Slow-moving and dead stock ─────────────────────────────────────────────────────────────────

export type MovementStatus = 'dead' | 'slow' | 'moving';

/**
 * Items with stock on hand, and how long since any of it was last sold or used (an issue). An
 * item never issued is aged from the first time stock of it arrived. At or beyond `slowDays` it is
 * slow; at or beyond `deadDays`, dead. Only slow and dead items are returned.
 */
export async function slowMoving(
	orgId: number,
	f: {
		locationIds: number[];
		today: string;
		slowDays: number;
		deadDays: number;
		categoryId?: number;
	},
	reader: Reader = db
) {
	if (!f.locationIds.length) return { rows: [], slowValue: 0, deadValue: 0 };
	const where = and(
		eq(stockMovement.orgId, orgId),
		inArray(stockMovement.locationId, f.locationIds)
	);
	const [stock, dates] = await Promise.all([
		reader
			.select({
				itemId: item.id,
				item: item.name,
				sku: item.sku,
				category: category.name,
				unit: uom.symbol,
				avgCost: item.avgCost,
				onHand: sql<number>`SUM(${stockBalance.quantity})`
			})
			.from(stockBalance)
			.innerJoin(item, eq(item.id, stockBalance.itemId))
			.innerJoin(uom, eq(uom.id, item.baseUomId))
			.leftJoin(category, eq(category.id, item.categoryId))
			.where(
				and(
					eq(stockBalance.orgId, orgId),
					inArray(stockBalance.locationId, f.locationIds),
					f.categoryId ? eq(item.categoryId, f.categoryId) : undefined
				)
			)
			.groupBy(item.id, item.name, item.sku, category.name, uom.symbol, item.avgCost)
			.having(sql`SUM(${stockBalance.quantity}) > 0`),
		reader
			.select({
				itemId: stockMovement.itemId,
				lastIssue: sql<
					string | null
				>`MAX(CASE WHEN ${stockMovement.kind} = 'issue' THEN ${stockMovement.docDate} END)`,
				lastReceipt: sql<
					string | null
				>`MAX(CASE WHEN ${stockMovement.kind} = 'receipt' THEN ${stockMovement.docDate} END)`,
				firstIn: sql<string>`MIN(${stockMovement.docDate})`
			})
			.from(stockMovement)
			.where(where)
			.groupBy(stockMovement.itemId)
	]);

	const byItem = new Map(dates.map((d) => [d.itemId, d]));
	const rows = stock
		.map((s) => {
			const d = byItem.get(s.itemId);
			const since = d?.lastIssue ?? d?.firstIn ?? f.today;
			const idle = Math.max(0, daysBetween(since, f.today));
			const status: MovementStatus =
				idle >= f.deadDays ? 'dead' : idle >= f.slowDays ? 'slow' : 'moving';
			const onHand = round4(Number(s.onHand));
			return {
				...s,
				onHand,
				value: money(onHand * s.avgCost),
				lastIssue: d?.lastIssue ?? null,
				lastReceipt: d?.lastReceipt ?? null,
				idleDays: idle,
				neverIssued: !d?.lastIssue,
				status
			};
		})
		.filter((r) => r.status !== 'moving')
		.sort((a, b) => b.idleDays - a.idleDays || b.value - a.value);

	const total = (s: MovementStatus) =>
		money(rows.filter((r) => r.status === s).reduce((t, r) => t + r.value, 0));
	return { rows, slowValue: total('slow'), deadValue: total('dead') };
}

// ── ABC analysis ──────────────────────────────────────────────────────────────────────────────

export type AbcClass = 'A' | 'B' | 'C' | 'none';
export type AbcBasis = 'cost' | 'revenue';

/**
 * Ranks items by what they were worth over the period — used at cost (issues less customer
 * returns) or sold for (sale lines before VAT, less returns) — and cuts the ranking at 80% and 95%
 * of the total: A items carry most of the value and deserve the most care, C items the least.
 * Items with stock but no use in the period are listed as "none".
 */
export function classify(values: { itemId: number; value: number }[]) {
	const ranked = values.filter((v) => v.value > 0).sort((a, b) => b.value - a.value);
	const total = ranked.reduce((s, v) => s + v.value, 0);
	let running = 0;
	return ranked.map((v, i) => {
		const before = total ? running / total : 0;
		running += v.value;
		const share = total ? v.value / total : 0;
		// An item's class is where its value *starts*: the item that crosses 80% is still an A.
		const cls: AbcClass = before < 0.8 ? 'A' : before < 0.95 ? 'B' : 'C';
		return {
			...v,
			rank: i + 1,
			share: Math.round(share * 10000) / 100,
			cumulative: total ? Math.round((running / total) * 10000) / 100 : 0,
			cls
		};
	});
}

export async function abcAnalysis(
	orgId: number,
	f: { locationIds: number[]; from: string; to: string; basis: AbcBasis },
	reader: Reader = db
) {
	if (!f.locationIds.length) return { rows: [], total: 0, classes: [] as ClassSummary[] };

	let values: { itemId: number; value: number; quantity: number }[];
	if (f.basis === 'cost') {
		const rows = await reader
			.select({
				itemId: stockMovement.itemId,
				value: sql<number>`-SUM(${stockMovement.quantity} * ${stockMovement.unitCost})`,
				quantity: sql<number>`-SUM(${stockMovement.quantity})`
			})
			.from(stockMovement)
			.where(
				and(
					eq(stockMovement.orgId, orgId),
					inArray(stockMovement.kind, ['issue', 'sales_return']),
					inArray(stockMovement.locationId, f.locationIds),
					gte(stockMovement.docDate, f.from),
					lte(stockMovement.docDate, f.to)
				)
			)
			.groupBy(stockMovement.itemId);
		values = rows.map((r) => ({
			itemId: r.itemId,
			value: money(r.value),
			quantity: round4(Number(r.quantity))
		}));
	} else {
		// Quantities in base units: a line in packs counts its packs' base units.
		const sign = sql`CASE WHEN ${stockDocument.type} = 'sales_return' THEN -1 ELSE 1 END`;
		const rows = await reader
			.select({
				itemId: stockDocumentLine.itemId,
				value: sql<number>`SUM(${sign} * ROUND(${stockDocumentLine.quantity} * COALESCE(${stockDocumentLine.unitPrice}, 0), 2))`,
				quantity: sql<number>`SUM(${sign} * ${stockDocumentLine.quantity})`
			})
			.from(stockDocumentLine)
			.innerJoin(stockDocument, eq(stockDocument.id, stockDocumentLine.documentId))
			.where(
				and(
					eq(stockDocument.orgId, orgId),
					eq(stockDocument.status, 'posted'),
					isNull(stockDocumentLine.deletedAt),
					sql`${stockDocumentLine.unitPrice} IS NOT NULL`,
					or(
						and(
							eq(stockDocument.type, 'issue'),
							inArray(stockDocument.fromLocationId, f.locationIds)
						),
						and(
							eq(stockDocument.type, 'sales_return'),
							inArray(stockDocument.toLocationId, f.locationIds)
						)
					),
					gte(stockDocument.docDate, f.from),
					lte(stockDocument.docDate, f.to)
				)
			)
			.groupBy(stockDocumentLine.itemId);
		values = rows.map((r) => ({
			itemId: r.itemId,
			value: money(r.value),
			quantity: round4(Number(r.quantity))
		}));
	}

	const ranked = classify(values);
	const stocked = await reader
		.select({ itemId: stockBalance.itemId, onHand: sql<number>`SUM(${stockBalance.quantity})` })
		.from(stockBalance)
		.where(and(eq(stockBalance.orgId, orgId), inArray(stockBalance.locationId, f.locationIds)))
		.groupBy(stockBalance.itemId)
		.having(sql`SUM(${stockBalance.quantity}) > 0`);
	const onHand = new Map(stocked.map((s) => [s.itemId, round4(Number(s.onHand))]));
	const quantity = new Map(values.map((v) => [v.itemId, v.quantity]));
	const idle = stocked.filter((s) => !ranked.some((r) => r.itemId === s.itemId));

	const ids = [...new Set([...ranked.map((r) => r.itemId), ...idle.map((s) => s.itemId)])];
	const items = ids.length
		? await reader
				.select({
					id: item.id,
					name: item.name,
					sku: item.sku,
					category: category.name,
					unit: uom.symbol,
					avgCost: item.avgCost
				})
				.from(item)
				.innerJoin(uom, eq(uom.id, item.baseUomId))
				.leftJoin(category, eq(category.id, item.categoryId))
				.where(and(eq(item.orgId, orgId), inArray(item.id, ids)))
		: [];
	const info = new Map(items.map((i) => [i.id, i]));

	const rows = [
		...ranked,
		...idle.map((s) => ({
			itemId: s.itemId,
			value: 0,
			rank: null as number | null,
			share: 0,
			cumulative: null as number | null,
			cls: 'none' as AbcClass
		}))
	].map((r) => {
		const i = info.get(r.itemId);
		const stock = onHand.get(r.itemId) ?? 0;
		return {
			...r,
			item: i?.name ?? '—',
			sku: i?.sku ?? '',
			category: i?.category ?? null,
			unit: i?.unit ?? '',
			quantity: quantity.get(r.itemId) ?? 0,
			onHand: stock,
			stockValue: money(stock * (i?.avgCost ?? 0))
		};
	});

	const total = money(ranked.reduce((s, r) => s + r.value, 0));
	const classes: ClassSummary[] = (['A', 'B', 'C', 'none'] as const).map((cls) => {
		const members = rows.filter((r) => r.cls === cls);
		const value = money(members.reduce((s, r) => s + r.value, 0));
		return {
			cls,
			items: members.length,
			value,
			share: total ? Math.round((value / total) * 10000) / 100 : 0,
			stockValue: money(members.reduce((s, r) => s + r.stockValue, 0))
		};
	});
	return { rows, total, classes };
}

type ClassSummary = {
	cls: AbcClass;
	items: number;
	value: number;
	share: number;
	stockValue: number;
};

// ── Stock-outs ────────────────────────────────────────────────────────────────────────────────

export type OutPeriod = { from: string; to: string | null };

/**
 * Walks a day-by-day list of net changes (oldest first) and returns every stretch the balance
 * spent at or below zero after having been above it. `to` is the day it was back above zero, or
 * null if it is still out. Days before the first stock ever arrived do not count.
 */
export function outPeriods(changes: { day: string; change: number }[]): OutPeriod[] {
	const periods: OutPeriod[] = [];
	let balance = 0;
	let seenStock = false;
	let open: OutPeriod | null = null;
	for (const c of changes) {
		balance = round4(balance + c.change);
		if (balance > 0) {
			seenStock = true;
			if (open) {
				open.to = c.day;
				periods.push(open);
				open = null;
			}
		} else if (seenStock && !open) {
			open = { from: c.day, to: null };
		}
	}
	if (open) periods.push(open);
	return periods;
}

/**
 * Every stretch an item's shelves were empty that overlaps the period: from the ledger, per item
 * across the chosen locations (`byLocation`: per location). Days are counted inside the period;
 * a stretch still open counts up to `to` (or today, whichever is earlier).
 */
export async function stockOuts(
	orgId: number,
	f: { locationIds: number[]; from: string; to: string; today: string; byLocation: boolean },
	reader: Reader = db
) {
	if (!f.locationIds.length) return { periods: [], items: [] };
	const rows = await reader
		.select({
			itemId: stockMovement.itemId,
			locationId: stockMovement.locationId,
			day: stockMovement.docDate,
			change: sql<number>`SUM(${stockMovement.quantity})`
		})
		.from(stockMovement)
		.innerJoin(item, eq(item.id, stockMovement.itemId))
		.where(
			and(
				eq(stockMovement.orgId, orgId),
				inArray(stockMovement.locationId, f.locationIds),
				lte(stockMovement.docDate, f.to),
				eq(item.stockTracked, true)
			)
		)
		.groupBy(stockMovement.itemId, stockMovement.locationId, stockMovement.docDate)
		.orderBy(asc(stockMovement.docDate));

	const series = new Map<
		string,
		{ itemId: number; locationId: number | null; changes: { day: string; change: number }[] }
	>();
	for (const r of rows) {
		const key = f.byLocation ? `${r.itemId}:${r.locationId}` : `${r.itemId}`;
		let s = series.get(key);
		if (!s) {
			s = { itemId: r.itemId, locationId: f.byLocation ? r.locationId : null, changes: [] };
			series.set(key, s);
		}
		const last = s.changes[s.changes.length - 1];
		if (last?.day === r.day) last.change = round4(last.change + Number(r.change));
		else s.changes.push({ day: r.day, change: Number(r.change) });
	}

	const end = f.to < f.today ? f.to : f.today;
	const periods: {
		itemId: number;
		locationId: number | null;
		outFrom: string;
		backIn: string | null;
		days: number;
	}[] = [];
	for (const s of series.values()) {
		for (const p of outPeriods(s.changes)) {
			if (p.to !== null && p.to <= f.from) continue;
			if (p.from > f.to) continue;
			const start = p.from < f.from ? f.from : p.from;
			const stop = p.to === null || p.to > end ? end : p.to;
			periods.push({
				itemId: s.itemId,
				locationId: s.locationId,
				outFrom: p.from,
				backIn: p.to,
				days: Math.max(0, daysBetween(start, stop))
			});
		}
	}

	const ids = [...new Set(periods.map((p) => p.itemId))];
	const [items, locations] = await Promise.all([
		ids.length
			? reader
					.select({ id: item.id, name: item.name, sku: item.sku, reorderLevel: item.reorderLevel })
					.from(item)
					.where(and(eq(item.orgId, orgId), inArray(item.id, ids)))
			: Promise.resolve([]),
		reader
			.select({ id: location.id, name: location.name })
			.from(location)
			.where(eq(location.orgId, orgId))
	]);
	const itemInfo = new Map(items.map((i) => [i.id, i]));
	const locationName = new Map(locations.map((l) => [l.id, l.name]));

	const detailed = periods
		.map((p) => ({
			...p,
			item: itemInfo.get(p.itemId)?.name ?? '—',
			sku: itemInfo.get(p.itemId)?.sku ?? '',
			location: p.locationId ? (locationName.get(p.locationId) ?? '—') : 'All chosen locations',
			stillOut: p.backIn === null
		}))
		.sort((a, b) => (a.outFrom < b.outFrom ? 1 : a.outFrom > b.outFrom ? -1 : 0));

	const perItem = new Map<
		string,
		{
			itemId: number;
			item: string;
			sku: string;
			location: string;
			times: number;
			days: number;
			stillOut: boolean;
			lastOut: string;
		}
	>();
	for (const p of detailed) {
		const key = `${p.itemId}:${p.locationId ?? 0}`;
		const cur = perItem.get(key);
		if (cur) {
			cur.times += 1;
			cur.days += p.days;
			cur.stillOut ||= p.stillOut;
			if (p.outFrom > cur.lastOut) cur.lastOut = p.outFrom;
		} else {
			perItem.set(key, {
				itemId: p.itemId,
				item: p.item,
				sku: p.sku,
				location: p.location,
				times: 1,
				days: p.days,
				stillOut: p.stillOut,
				lastOut: p.outFrom
			});
		}
	}
	return {
		periods: detailed,
		items: [...perItem.values()].sort(
			(a, b) => Number(b.stillOut) - Number(a.stillOut) || b.days - a.days
		)
	};
}

// ── Stock trend ───────────────────────────────────────────────────────────────────────────────

export type Grain = 'day' | 'week' | 'month';

/** The bucket a day falls in: itself, the Monday of its week, or its Ethiopian month. */
export function bucketOf(day: string, grain: Grain) {
	if (grain === 'day') return { key: day, label: ethiopianDay(day) };
	if (grain === 'week') {
		const d = new Date(`${day}T00:00:00Z`);
		const monday = new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * DAY)
			.toISOString()
			.slice(0, 10);
		return { key: monday, label: `Week of ${ethiopianDay(monday)}` };
	}
	const e = getEthiopianYearMonth(noon(day))!;
	const [, month, year] = ethiopianDay(day).split(' ');
	return { key: `${e.year}-${String(e.month).padStart(2, '0')}`, label: `${month} ${year}` };
}

/**
 * An item's stock level over a period, rebuilt from the ledger: what it held before the period
 * began, then day by day. Each bucket shows what came in, what went out, the lowest point and the
 * level at its end. With the reorder level (or a location's min/max) to draw against.
 */
export async function stockTrend(
	orgId: number,
	f: {
		itemId: number;
		locationIds: number[];
		/** The one location chosen, for its reorder rule. */
		locationId?: number;
		from: string;
		to: string;
		grain: Grain;
	},
	reader: Reader = db
) {
	const [it] = await reader
		.select({
			id: item.id,
			name: item.name,
			sku: item.sku,
			unit: uom.symbol,
			reorderLevel: item.reorderLevel
		})
		.from(item)
		.innerJoin(uom, eq(uom.id, item.baseUomId))
		.where(and(eq(item.id, f.itemId), eq(item.orgId, orgId)));
	if (!it) return null;

	const scoped = and(
		eq(stockMovement.orgId, orgId),
		eq(stockMovement.itemId, it.id),
		f.locationIds.length ? inArray(stockMovement.locationId, f.locationIds) : sql`FALSE`
	);
	const [[opening], days, rule] = await Promise.all([
		reader
			.select({ q: sql<number>`COALESCE(SUM(${stockMovement.quantity}), 0)` })
			.from(stockMovement)
			.where(and(scoped, lt(stockMovement.docDate, f.from))),
		// Netted per document, so a transfer between two of the chosen locations cancels out
		// rather than showing as both in and out.
		reader
			.select({
				day: stockMovement.docDate,
				net: sql<number>`SUM(${stockMovement.quantity})`
			})
			.from(stockMovement)
			.where(and(scoped, gte(stockMovement.docDate, f.from), lte(stockMovement.docDate, f.to)))
			.groupBy(stockMovement.docDate, stockMovement.documentId)
			.orderBy(asc(stockMovement.docDate)),
		f.locationId
			? reader
					.select({ min: reorderRule.minQuantity, max: reorderRule.maxQuantity })
					.from(reorderRule)
					.where(and(eq(reorderRule.itemId, it.id), eq(reorderRule.locationId, f.locationId)))
			: Promise.resolve([])
	]);

	const byDay = new Map<string, { in: number; out: number }>();
	for (const d of days) {
		const net = round4(Number(d.net));
		const cur = byDay.get(d.day) ?? { in: 0, out: 0 };
		if (net > 0) cur.in = round4(cur.in + net);
		else cur.out = round4(cur.out - net);
		byDay.set(d.day, cur);
	}
	const buckets: {
		key: string;
		label: string;
		in: number;
		out: number;
		low: number;
		closing: number;
	}[] = [];
	let level = round4(Number(opening.q));
	for (let d = f.from; d <= f.to; d = nextDay(d)) {
		const { key, label } = bucketOf(d, f.grain);
		let b = buckets[buckets.length - 1];
		if (!b || b.key !== key) {
			b = { key, label, in: 0, out: 0, low: level, closing: level };
			buckets.push(b);
		}
		const moved = byDay.get(d);
		if (moved) {
			b.in = round4(b.in + moved.in);
			b.out = round4(b.out + moved.out);
			level = round4(level + moved.in - moved.out);
		}
		b.low = Math.min(b.low, level);
		b.closing = level;
	}

	const lines = rule[0]
		? { min: rule[0].min, max: rule[0].max, source: 'location' as const }
		: it.reorderLevel !== null && !f.locationId
			? { min: it.reorderLevel, max: null, source: 'item' as const }
			: null;

	return {
		item: it,
		opening: round4(Number(opening.q)),
		closing: level,
		buckets,
		lines,
		totalIn: round4(buckets.reduce((s, b) => s + b.in, 0)),
		totalOut: round4(buckets.reduce((s, b) => s + b.out, 0)),
		low: buckets.length ? Math.min(...buckets.map((b) => b.low)) : level
	};
}

// ── Serial lookup ─────────────────────────────────────────────────────────────────────────────

/** `YYYY-MM-DD` plus whole months, clamped to the month's last day (31 Jan + 1 month = 28/29 Feb). */
export function addMonths(day: string, months: number) {
	const [y, m, d] = day.split('-').map(Number);
	const target = new Date(Date.UTC(y, m - 1 + months, 1));
	const last = new Date(
		Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)
	).getUTCDate();
	target.setUTCDate(Math.min(d, last));
	return target.toISOString().slice(0, 10);
}

export type Warranty =
	| { state: 'none' }
	| { state: 'not_sold'; months: number }
	| { state: 'active'; until: string; soldOn: string; months: number }
	| { state: 'expired'; until: string; soldOn: string; months: number };

/** Warranty runs from the day of the last sale for the item's months; a unit in stock has not started. */
export function warrantyOf(months: number | null, soldOn: string | null, today: string): Warranty {
	if (!months) return { state: 'none' };
	if (!soldOn) return { state: 'not_sold', months };
	const until = addMonths(soldOn, months);
	return until >= today
		? { state: 'active', until, soldOn, months }
		: { state: 'expired', until, soldOn, months };
}

/**
 * Serial numbers matching the search (any part of the number), each with where it is now, who
 * supplied it, everything that happened to it, and its warranty. At most 25 units.
 */
export async function serialLookup(
	orgId: number,
	f: { q: string; today: string; scope: number[] | null },
	reader: Reader = db
) {
	const q = f.q.trim();
	if (q.length < 2) return [];
	const units = await reader
		.select({
			id: serialUnit.id,
			serialNumber: serialUnit.serialNumber,
			status: serialUnit.status,
			itemId: item.id,
			item: item.name,
			sku: item.sku,
			warrantyMonths: item.warrantyMonths,
			location: location.name,
			locationBranch: location.branchId,
			lotNumber: lot.lotNumber,
			expiryDate: lot.expiryDate,
			supplierId: supplier.id,
			supplier: supplier.name
		})
		.from(serialUnit)
		.innerJoin(item, eq(item.id, serialUnit.itemId))
		.leftJoin(location, eq(location.id, serialUnit.locationId))
		.leftJoin(lot, eq(lot.id, serialUnit.lotId))
		.leftJoin(supplier, eq(supplier.id, serialUnit.supplierId))
		.where(
			and(
				eq(serialUnit.orgId, orgId),
				like(serialUnit.serialNumber, `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`)
			)
		)
		.orderBy(asc(serialUnit.serialNumber))
		.limit(25);
	if (!units.length) return [];

	const moveLoc = alias(location, 'move_loc');
	const moveSupplier = alias(supplier, 'move_supplier');
	const history = await reader
		.select({
			serialUnitId: stockMovement.serialUnitId,
			id: stockMovement.id,
			kind: stockMovement.kind,
			day: stockMovement.docDate,
			quantity: stockMovement.quantity,
			locationId: stockMovement.locationId,
			location: moveLoc.name,
			branchId: moveLoc.branchId,
			documentId: stockDocument.id,
			documentType: stockDocument.type,
			documentNumber: stockDocument.number,
			customerId: customer.id,
			customer: customer.name,
			party: stockDocument.party,
			supplier: moveSupplier.name
		})
		.from(stockMovement)
		.innerJoin(moveLoc, eq(moveLoc.id, stockMovement.locationId))
		.innerJoin(stockDocument, eq(stockDocument.id, stockMovement.documentId))
		.leftJoin(customer, eq(customer.id, stockDocument.customerId))
		.leftJoin(moveSupplier, eq(moveSupplier.id, stockDocument.supplierId))
		.where(
			and(
				eq(stockMovement.orgId, orgId),
				inArray(
					stockMovement.serialUnitId,
					units.map((u) => u.id)
				)
			)
		)
		.orderBy(asc(stockMovement.id));

	return units
		.map((u) => {
			const events = history
				.filter((h) => h.serialUnitId === u.id)
				.map((h) => ({
					...h,
					who:
						h.kind === 'receipt' || h.kind === 'purchase_return'
							? h.supplier
							: h.kind === 'issue' || h.kind === 'sales_return'
								? (h.customer ?? h.party)
								: null
				}));
			// Out of scope: a unit none of whose movements (nor its current place) is in the viewer's branches.
			const visible =
				f.scope === null ||
				(u.locationBranch !== null && f.scope.includes(u.locationBranch)) ||
				events.some((e) => f.scope!.includes(e.branchId));
			const lastSale = [...events]
				.reverse()
				.find((e) => e.kind === 'issue' && e.documentType === 'issue');
			const soldOn =
				u.status === 'issued' || u.status === 'leased' ? (lastSale?.day ?? null) : null;
			return {
				...u,
				visible,
				soldTo: soldOn ? (lastSale?.customer ?? lastSale?.party ?? null) : null,
				saleDocumentId: soldOn ? (lastSale?.documentId ?? null) : null,
				saleNumber: soldOn ? (lastSale?.documentNumber ?? null) : null,
				warranty: warrantyOf(u.warrantyMonths, soldOn, f.today),
				events
			};
		})
		.filter((u) => u.visible);
}

/** Items to pick from on the trend report: everything stocked, labelled with its code. */
export async function trendItems(orgId: number) {
	return db
		.select({ value: item.id, name: sql<string>`CONCAT(${item.name}, ' — ', ${item.sku})` })
		.from(item)
		.where(and(eq(item.orgId, orgId), eq(item.stockTracked, true), isNull(item.deletedAt)))
		.orderBy(asc(item.name));
}

// ── Page filters ──────────────────────────────────────────────────────────────────────────────

const isDay = (v: string | null): v is string => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);

/**
 * What a report page is looking at, read off its query string and the viewer's branch scope: the
 * branches and locations it may offer, the one chosen (if any), and the period.
 */
export async function reportFilters(
	orgId: number,
	scope: number[] | null,
	params: URLSearchParams,
	defaults: { today: string; days: number }
) {
	const [allBranches, locations] = await Promise.all([
		db
			.select({ value: branch.id, name: branch.name })
			.from(branch)
			.where(and(eq(branch.orgId, orgId), isNull(branch.deletedAt)))
			.orderBy(asc(branch.name)),
		reportLocations(orgId, scope)
	]);
	const branches = allBranches.filter((b) => scope === null || scope.includes(b.value));
	const wantBranch = Number(params.get('branch')) || 0;
	const branchId = branches.some((b) => b.value === wantBranch) ? wantBranch : 0;
	const wantLocation = Number(params.get('location')) || 0;
	const locationId = locations.some(
		(l) => l.value === wantLocation && (!branchId || l.branchId === branchId)
	)
		? wantLocation
		: 0;

	let to = isDay(params.get('to')) ? params.get('to')! : defaults.today;
	let from = isDay(params.get('from'))
		? params.get('from')!
		: new Date(Date.parse(`${to}T00:00:00Z`) - (defaults.days - 1) * DAY)
				.toISOString()
				.slice(0, 10);
	if (from > to) [from, to] = [to, from];
	// Beyond three years a day-by-day walk stops being a report.
	const floor = new Date(Date.parse(`${to}T00:00:00Z`) - 1100 * DAY).toISOString().slice(0, 10);
	if (from < floor) from = floor;

	return {
		branches,
		locations: locations.filter((l) => !branchId || l.branchId === branchId),
		branchId,
		locationId,
		from,
		to
	};
}
