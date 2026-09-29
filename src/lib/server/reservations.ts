/**
 * Reservations: stock promised and not yet taken. An accepted proforma holds what it quotes at the
 * location it will be sold from; an approved requisition holds what was approved at its store.
 * Only when the business turns reservations on (`organization.reserveStock`).
 *
 * The posting service refuses an issue or transfer that would dip into stock held for someone
 * else, and releases a reservation once the sale or issue it was held for is posted.
 *
 * Plain database code: the posting service imports it.
 */
import { and, eq, inArray, isNull, ne, or, sql, type SQL } from 'drizzle-orm';
import { db } from '$lib/server/db';
import {
	item,
	itemUnit,
	kitComponent,
	location,
	organization,
	quote,
	quoteLine,
	requisition,
	requisitionLine,
	stockReservation,
	uom
} from '$lib/server/db/schema';
import { round4 } from '$lib/server/stock/math';

type Reader = Pick<typeof db, 'select'>;
type Writer = Pick<typeof db, 'select' | 'insert' | 'delete'>;

/** Reservations still holding: the proforma is accepted and in date (or being sold), the requisition approved. */
function holding(today: string): SQL {
	return or(
		and(
			sql`${stockReservation.quoteId} IS NOT NULL`,
			or(
				eq(quote.status, 'converted'),
				and(
					eq(quote.status, 'accepted'),
					or(isNull(quote.validUntil), sql`${quote.validUntil} >= ${today}`)
				)
			)
		),
		and(sql`${stockReservation.requisitionId} IS NOT NULL`, eq(requisition.status, 'approved'))
	)!;
}

/**
 * How much of an item at a location is held for others: everything reserved there except what
 * is held for this proforma or requisition. In base units.
 */
export async function reservedElsewhere(
	reader: Reader,
	input: {
		orgId: number;
		itemId: number;
		locationId: number;
		today: string;
		quoteId?: number | null;
		requisitionId?: number | null;
	}
): Promise<number> {
	const [row] = await reader
		.select({ quantity: sql<number>`COALESCE(SUM(${stockReservation.quantity}), 0)` })
		.from(stockReservation)
		.leftJoin(quote, eq(quote.id, stockReservation.quoteId))
		.leftJoin(requisition, eq(requisition.id, stockReservation.requisitionId))
		.where(
			and(
				eq(stockReservation.orgId, input.orgId),
				eq(stockReservation.itemId, input.itemId),
				eq(stockReservation.locationId, input.locationId),
				holding(input.today),
				input.quoteId
					? or(isNull(stockReservation.quoteId), ne(stockReservation.quoteId, input.quoteId))
					: undefined,
				input.requisitionId
					? or(
							isNull(stockReservation.requisitionId),
							ne(stockReservation.requisitionId, input.requisitionId)
						)
					: undefined
			)
		);
	return round4(Number(row?.quantity ?? 0));
}

/** Everything held, by `locationId:itemId`, for the on-hand screen. */
export async function reservedByLocation(orgId: number, today: string, reader: Reader = db) {
	const rows = await reader
		.select({
			locationId: stockReservation.locationId,
			itemId: stockReservation.itemId,
			quantity: sql<number>`SUM(${stockReservation.quantity})`
		})
		.from(stockReservation)
		.leftJoin(quote, eq(quote.id, stockReservation.quoteId))
		.leftJoin(requisition, eq(requisition.id, stockReservation.requisitionId))
		.where(and(eq(stockReservation.orgId, orgId), holding(today)))
		.groupBy(stockReservation.locationId, stockReservation.itemId);
	return new Map(rows.map((r) => [`${r.locationId}:${r.itemId}`, round4(Number(r.quantity))]));
}

/** What an item's reservations are for, for its page. */
export async function reservationsOfItem(orgId: number, itemId: number, today: string) {
	return db
		.select({
			id: stockReservation.id,
			locationId: stockReservation.locationId,
			quantity: stockReservation.quantity,
			quoteId: stockReservation.quoteId,
			quoteNumber: quote.number,
			requisitionId: stockReservation.requisitionId,
			requisitionNumber: requisition.number,
			department: requisition.department,
			createdAt: stockReservation.createdAt
		})
		.from(stockReservation)
		.leftJoin(quote, eq(quote.id, stockReservation.quoteId))
		.leftJoin(requisition, eq(requisition.id, stockReservation.requisitionId))
		.where(
			and(eq(stockReservation.orgId, orgId), eq(stockReservation.itemId, itemId), holding(today))
		);
}

async function reservesStock(orgId: number, reader: Reader) {
	const [org] = await reader
		.select({ on: organization.reserveStock })
		.from(organization)
		.where(eq(organization.id, orgId));
	return org?.on ?? false;
}

/**
 * Lines in whatever unit, as base quantities per stocked item: packs converted, kits opened into
 * their components, services dropped (nothing to hold).
 */
export async function baseNeeds(
	reader: Reader,
	orgId: number,
	lines: { itemId: number; uomId: number; quantity: number }[]
): Promise<Map<number, number>> {
	const out = new Map<number, number>();
	if (!lines.length) return out;
	const itemIds = [...new Set(lines.map((l) => l.itemId))];
	const components = await reader
		.select()
		.from(kitComponent)
		.where(and(inArray(kitComponent.kitItemId, itemIds), isNull(kitComponent.deletedAt)));
	const allIds = [...new Set([...itemIds, ...components.map((c) => c.componentItemId)])];
	const [items, units] = await Promise.all([
		reader
			.select({
				id: item.id,
				baseUomId: item.baseUomId,
				stockTracked: item.stockTracked,
				isKit: item.isKit
			})
			.from(item)
			.where(and(eq(item.orgId, orgId), inArray(item.id, allIds))),
		reader
			.select()
			.from(itemUnit)
			.where(and(inArray(itemUnit.itemId, allIds), isNull(itemUnit.deletedAt)))
	]);
	const factor = (itemId: number, uomId: number) => {
		const it = items.find((i) => i.id === itemId);
		if (!it || uomId === it.baseUomId) return 1;
		return units.find((u) => u.itemId === itemId && u.uomId === uomId)?.factor ?? 1;
	};
	const add = (itemId: number, q: number) => out.set(itemId, round4((out.get(itemId) ?? 0) + q));

	for (const l of lines) {
		const it = items.find((i) => i.id === l.itemId);
		if (!it) continue;
		const base = round4(l.quantity * factor(l.itemId, l.uomId));
		if (it.isKit) {
			for (const c of components.filter((x) => x.kitItemId === it.id)) {
				const comp = items.find((i) => i.id === c.componentItemId);
				if (comp?.stockTracked) {
					add(comp.id, base * c.quantity * factor(comp.id, c.uomId));
				}
			}
		} else if (it.stockTracked) {
			add(it.id, base);
		}
	}
	return out;
}

/** Holds a proforma's lines at its location — when reservations are on and it names one. */
export async function reserveQuote(
	tx: Writer,
	input: { orgId: number; quoteId: number; userId?: string }
): Promise<number> {
	await releaseQuote(tx, input.quoteId);
	if (!(await reservesStock(input.orgId, tx))) return 0;
	const [q] = await tx
		.select({ locationId: quote.locationId })
		.from(quote)
		.where(and(eq(quote.id, input.quoteId), eq(quote.orgId, input.orgId)));
	if (!q?.locationId) return 0;
	const lines = await tx
		.select({ itemId: quoteLine.itemId, uomId: quoteLine.uomId, quantity: quoteLine.quantity })
		.from(quoteLine)
		.where(and(eq(quoteLine.quoteId, input.quoteId), isNull(quoteLine.deletedAt)));
	const needs = await baseNeeds(tx, input.orgId, lines);
	const rows = [...needs].map(([itemId, quantity]) => ({
		orgId: input.orgId,
		itemId,
		locationId: q.locationId!,
		quantity,
		quoteId: input.quoteId,
		createdBy: input.userId ?? null
	}));
	if (rows.length) await tx.insert(stockReservation).values(rows);
	return rows.length;
}

/** Holds what was approved on a requisition at its store — when reservations are on. */
export async function reserveRequisition(
	tx: Writer,
	input: { orgId: number; requisitionId: number; userId?: string }
): Promise<number> {
	await releaseRequisition(tx, input.requisitionId);
	if (!(await reservesStock(input.orgId, tx))) return 0;
	const [r] = await tx
		.select({ locationId: requisition.locationId })
		.from(requisition)
		.where(and(eq(requisition.id, input.requisitionId), eq(requisition.orgId, input.orgId)));
	if (!r) return 0;
	const lines = await tx
		.select({
			itemId: requisitionLine.itemId,
			uomId: requisitionLine.uomId,
			quantity: sql<number>`COALESCE(${requisitionLine.approvedQuantity}, ${requisitionLine.quantity})`
		})
		.from(requisitionLine)
		.where(
			and(eq(requisitionLine.requisitionId, input.requisitionId), isNull(requisitionLine.deletedAt))
		);
	const needs = await baseNeeds(
		tx,
		input.orgId,
		lines.map((l) => ({ ...l, quantity: Number(l.quantity) })).filter((l) => l.quantity > 0)
	);
	const rows = [...needs].map(([itemId, quantity]) => ({
		orgId: input.orgId,
		itemId,
		locationId: r.locationId,
		quantity,
		requisitionId: input.requisitionId,
		createdBy: input.userId ?? null
	}));
	if (rows.length) await tx.insert(stockReservation).values(rows);
	return rows.length;
}

export async function releaseQuote(tx: Pick<typeof db, 'delete'>, quoteId: number) {
	await tx.delete(stockReservation).where(eq(stockReservation.quoteId, quoteId));
}

export async function releaseRequisition(tx: Pick<typeof db, 'delete'>, requisitionId: number) {
	await tx.delete(stockReservation).where(eq(stockReservation.requisitionId, requisitionId));
}

/** What is held for one proforma, per item and location, for its page. */
export async function reservationsOfQuote(orgId: number, quoteId: number) {
	return db
		.select({
			id: stockReservation.id,
			item: item.name,
			unit: uom.symbol,
			location: location.name,
			quantity: stockReservation.quantity
		})
		.from(stockReservation)
		.innerJoin(item, eq(item.id, stockReservation.itemId))
		.innerJoin(uom, eq(uom.id, item.baseUomId))
		.innerJoin(location, eq(location.id, stockReservation.locationId))
		.where(and(eq(stockReservation.orgId, orgId), eq(stockReservation.quoteId, quoteId)));
}
