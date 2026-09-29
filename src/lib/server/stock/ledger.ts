/**
 * The ledger's primitives: one movement and the balance it changes, and what stock is valued at
 * as it comes in and goes out — by moving average, or first in first out.
 *
 * Only the posting service and transfer receiving call these, inside their transaction.
 */
import { and, asc, eq, gt, sql } from 'drizzle-orm';
import type { db } from '$lib/server/db';
import {
	costLayer,
	item,
	stockBalance,
	stockDocument,
	stockDocumentLine,
	stockMovement,
	MOVEMENT_KINDS
} from '$lib/server/db/schema';
import { movingAverage, round4 } from './math';

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type Item = typeof item.$inferSelect;
export type Line = typeof stockDocumentLine.$inferSelect;
export type Doc = typeof stockDocument.$inferSelect;
export type Kind = (typeof MOVEMENT_KINDS)[number];
export type Costing = 'average' | 'fifo';

export type Context = {
	tx: Tx;
	orgId: number;
	doc: Doc;
	userId: string | undefined;
	today: string;
	/** The ledger date of the movements: the document's, or the day a transfer arrived. */
	moveDate: string;
	costing: Costing;
	units: Map<number, string>;
	locationNames: Map<number, string>;
	/** Said to the person posting, not refusals: a short shelf life, for one. */
	warnings: string[];
};

/** One ledger row, and the balance it changes. Returns the movement's id. */
export async function move(
	ctx: Context,
	m: {
		kind: Kind;
		it: Item;
		line: Line;
		locationId: number;
		lotId: number | null;
		serialUnitId: number | null;
		supplierId: number;
		quantity: number;
		cost: number;
	}
): Promise<number> {
	const { tx, orgId, doc, userId } = ctx;

	const [row] = await tx
		.insert(stockMovement)
		.values({
			orgId,
			kind: m.kind,
			itemId: m.it.id,
			locationId: m.locationId,
			lotId: m.lotId,
			serialUnitId: m.serialUnitId,
			supplierId: m.supplierId,
			quantity: m.quantity,
			unitCost: m.cost,
			documentId: doc.id,
			documentLineId: m.line.id,
			docDate: ctx.moveDate,
			createdBy: userId ?? null
		})
		.$returningId();

	await tx
		.insert(stockBalance)
		.values({
			orgId,
			locationId: m.locationId,
			itemId: m.it.id,
			lotId: m.lotId,
			lotKey: m.lotId ?? 0,
			quantity: m.quantity
		})
		.onDuplicateKeyUpdate({
			set: { quantity: sql`ROUND(${stockBalance.quantity} + ${m.quantity}, 4)` }
		});
	return row.id;
}

/**
 * Stock arriving at `cost` per base unit: the item's value moves. By moving average, the average
 * takes it in; by FIFO, it becomes a new layer, and the average follows the layers left.
 * Call before the movements, so `it.avgCost` is current for any later line of the same item.
 */
export async function valueIn(ctx: Context, it: Item, quantity: number, cost: number) {
	const { tx, orgId } = ctx;
	if (ctx.costing === 'fifo') {
		await tx.insert(costLayer).values({
			orgId,
			itemId: it.id,
			docDate: ctx.moveDate,
			quantity,
			remaining: quantity,
			unitCost: round4(cost)
		});
		await refreshAverage(tx, it);
		return;
	}
	// The average is taken over everything on hand before this arrives, everywhere.
	const [{ onHand }] = await tx
		.select({ onHand: sql<number>`COALESCE(SUM(${stockBalance.quantity}), 0)` })
		.from(stockBalance)
		.where(and(eq(stockBalance.itemId, it.id), eq(stockBalance.orgId, orgId)));
	const newAvg = movingAverage(Number(onHand), it.avgCost, quantity, cost);
	if (newAvg !== it.avgCost) {
		await tx.update(item).set({ avgCost: newAvg }).where(eq(item.id, it.id));
		it.avgCost = newAvg;
	}
}

/**
 * Stock leaving the business (sold, written off, lost, sent back): what it is valued at, per base
 * unit. By moving average, the average. By FIFO, the oldest layers are used up first; if the
 * layers run short (stock from before FIFO was on, say), the rest goes at the average.
 */
export async function valueOut(ctx: Context, it: Item, quantity: number): Promise<number> {
	if (ctx.costing !== 'fifo' || quantity <= 0) return it.avgCost;
	const { tx, orgId } = ctx;
	const layers = await tx
		.select()
		.from(costLayer)
		.where(and(eq(costLayer.orgId, orgId), eq(costLayer.itemId, it.id), gt(costLayer.remaining, 0)))
		.orderBy(asc(costLayer.docDate), asc(costLayer.id))
		.for('update');

	let left = round4(quantity);
	let value = 0;
	for (const layer of layers) {
		if (left <= 0) break;
		const take = round4(Math.min(Number(layer.remaining), left));
		value += take * Number(layer.unitCost);
		left = round4(left - take);
		await tx
			.update(costLayer)
			.set({ remaining: round4(Number(layer.remaining) - take) })
			.where(eq(costLayer.id, layer.id));
	}
	value += left * it.avgCost;
	const cost = round4(value / quantity);
	await refreshAverage(tx, it);
	return cost;
}

/** Under FIFO, the average cost is what the layers left are worth per unit — so valuations hold. */
async function refreshAverage(tx: Tx, it: Item) {
	const [row] = await tx
		.select({
			quantity: sql<number>`COALESCE(SUM(${costLayer.remaining}), 0)`,
			value: sql<number>`COALESCE(SUM(${costLayer.remaining} * ${costLayer.unitCost}), 0)`
		})
		.from(costLayer)
		.where(and(eq(costLayer.itemId, it.id), gt(costLayer.remaining, 0)));
	const quantity = Number(row.quantity);
	if (quantity <= 0) return;
	const avg = round4(Number(row.value) / quantity);
	if (avg !== it.avgCost) {
		await tx.update(item).set({ avgCost: avg }).where(eq(item.id, it.id));
		it.avgCost = avg;
	}
}

/**
 * Turning FIFO on: everything on hand becomes one opening layer per item at its average cost, so
 * the first sales after the switch are valued as before.
 */
export async function startFifo(tx: Tx, orgId: number, today: string) {
	await tx.delete(costLayer).where(eq(costLayer.orgId, orgId));
	const rows = await tx
		.select({
			itemId: stockBalance.itemId,
			quantity: sql<number>`SUM(${stockBalance.quantity})`,
			avgCost: item.avgCost
		})
		.from(stockBalance)
		.innerJoin(item, eq(item.id, stockBalance.itemId))
		.where(eq(stockBalance.orgId, orgId))
		.groupBy(stockBalance.itemId, item.avgCost);
	const layers = rows
		.map((r) => ({ ...r, quantity: round4(Number(r.quantity)) }))
		.filter((r) => r.quantity > 0)
		.map((r) => ({
			orgId,
			itemId: r.itemId,
			docDate: today,
			quantity: r.quantity,
			remaining: r.quantity,
			unitCost: r.avgCost
		}));
	if (layers.length) await tx.insert(costLayer).values(layers);
	return layers.length;
}
