/**
 * Transfers between branches travel. Posting one takes the stock out of the sending location into
 * the receiving branch's transit location, and the document waits `in_transit`. The receiving
 * branch then says what arrived: that moves out of transit onto its shelf, and whatever did not
 * arrive is written off as lost in transit — so the ledger shows the loss rather than hiding it.
 */
import { m } from '$lib/paraglide/messages.js';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { localToday } from '@nahu/admin-kit/time';
import {
	item,
	location,
	organization,
	serialUnit,
	stockDocument,
	stockDocumentLine,
	stockMovement,
	uom
} from '$lib/server/db/schema';
import { StockError } from './errors';
import { move, valueOut, type Context, type Tx } from './ledger';
import { parseSerials, toBase } from './math';
import { round4 } from '$lib/money';
import { unitFactors } from '$lib/server/units';

/** The branch's transit location, made the first time something is sent there. */
export async function ensureTransitLocation(tx: Tx, orgId: number, branchId: number) {
	const [found] = await tx
		.select({ id: location.id })
		.from(location)
		.where(
			and(
				eq(location.orgId, orgId),
				eq(location.branchId, branchId),
				eq(location.kind, 'transit'),
				isNull(location.deletedAt)
			)
		);
	if (found) return found.id;
	const [created] = await tx
		.insert(location)
		.values({ orgId, branchId, name: 'In transit', kind: 'transit' })
		.$returningId();
	return created.id;
}

export type Arrival = {
	lineId: number;
	/** In the line's unit. For serial items, the serials that arrived decide it. */
	quantity: number;
	serials?: string[] | null;
};

/**
 * The receiving branch records what arrived. Lines not mentioned arrived in full. Returns what
 * was lost, per line, in the line's unit.
 */
export async function receiveTransfer(
	tx: Tx,
	input: {
		orgId: number;
		documentId: number;
		userId?: string;
		today?: string;
		arrivals: Arrival[];
		note?: string | null;
	}
): Promise<{ lost: { lineId: number; item: string; quantity: number }[] }> {
	const { orgId, userId } = input;
	const today = input.today ?? localToday();

	const [doc] = await tx
		.select()
		.from(stockDocument)
		.where(and(eq(stockDocument.id, input.documentId), eq(stockDocument.orgId, orgId)))
		.for('update');
	if (!doc) throw new StockError(m.stock_err_no_document());
	if (doc.status !== 'in_transit') {
		throw new StockError(
			doc.status === 'posted' ? m.stock_err_already_received() : m.stock_err_nothing_on_way()
		);
	}
	const transitId = doc.transitLocationId!;
	const toId = doc.toLocationId!;
	if (today < doc.docDate) throw new StockError(m.stock_err_arrive_before_sent());

	const lines = await tx
		.select()
		.from(stockDocumentLine)
		.where(and(eq(stockDocumentLine.documentId, doc.id), isNull(stockDocumentLine.deletedAt)))
		.orderBy(asc(stockDocumentLine.id));
	const [org] = await tx
		.select({ costing: organization.costingMethod })
		.from(organization)
		.where(eq(organization.id, orgId));
	const locations = await tx
		.select({ id: location.id, name: location.name })
		.from(location)
		.where(eq(location.orgId, orgId));
	const units = await tx
		.select({ id: uom.id, symbol: uom.symbol })
		.from(uom)
		.where(eq(uom.orgId, orgId));

	const ctx: Context = {
		tx,
		orgId,
		doc,
		userId,
		today,
		// The ledger shows the day it arrived.
		moveDate: today,
		costing: org?.costing === 'fifo' ? 'fifo' : 'average',
		units: new Map(units.map((u) => [u.id, u.symbol])),
		locationNames: new Map(locations.map((l) => [l.id, l.name])),
		warnings: []
	};

	const lost: { lineId: number; item: string; quantity: number }[] = [];
	const factorOf = await unitFactors(
		tx,
		lines.map((l) => l.itemId)
	);
	for (const line of lines) {
		const [it] = await tx.select().from(item).where(eq(item.id, line.itemId)).for('update');
		const factor = factorOf(it, line.uomId) ?? 1;

		// What went into transit on this line: per lot, and per serial unit.
		const sent = await tx
			.select({
				lotId: stockMovement.lotId,
				serialUnitId: stockMovement.serialUnitId,
				supplierId: stockMovement.supplierId,
				quantity: stockMovement.quantity,
				cost: stockMovement.unitCost,
				serialNumber: serialUnit.serialNumber
			})
			.from(stockMovement)
			.leftJoin(serialUnit, eq(serialUnit.id, stockMovement.serialUnitId))
			.where(
				and(
					eq(stockMovement.documentLineId, line.id),
					eq(stockMovement.locationId, transitId),
					eq(stockMovement.kind, 'transfer_in')
				)
			)
			.orderBy(asc(stockMovement.id));
		const sentBase = round4(sent.reduce((s, m) => s + Number(m.quantity), 0));

		const arrival = input.arrivals.find((a) => a.lineId === line.id);
		let arrivedSerials: Set<string> | null = null;
		let arrivedBase: number;
		if (it.trackSerials) {
			const { serials, duplicates } = parseSerials((arrival?.serials ?? []).join('\n'));
			if (duplicates.length) {
				throw new StockError(m.stock_err_serial_twice({ serials: duplicates.join(', ') }), line.id);
			}
			const listed = arrival ? serials : sent.map((m) => m.serialNumber!);
			const stranger = listed.find((s) => !sent.some((m) => m.serialNumber === s));
			if (stranger) {
				throw new StockError(
					m.stock_err_serial_not_sent({ serial: stranger, item: it.name }),
					line.id
				);
			}
			arrivedSerials = new Set(listed);
			arrivedBase = arrivedSerials.size;
		} else {
			arrivedBase = arrival ? toBase(arrival.quantity, factor) : sentBase;
			if (!(arrivedBase >= 0)) {
				throw new StockError(m.stock_err_enter_arrived({ item: it.name }), line.id);
			}
			if (arrivedBase > sentBase + 0.00001) {
				throw new StockError(
					m.stock_err_more_arrived({ item: it.name, sent: round4(sentBase / factor) }),
					line.id
				);
			}
		}

		// Arrived stock moves onto the shelf; the rest is lost in transit.
		let toArrive = arrivedBase;
		const missing: typeof sent = [];
		for (const m of sent) {
			const q = Number(m.quantity);
			const arrives = arrivedSerials
				? arrivedSerials.has(m.serialNumber!)
					? q
					: 0
				: round4(Math.min(q, toArrive));
			toArrive = round4(toArrive - arrives);
			const base = {
				it,
				line,
				lotId: m.lotId,
				serialUnitId: m.serialUnitId,
				supplierId: m.supplierId
			};
			if (arrives > 0) {
				await move(ctx, {
					...base,
					kind: 'transfer_out',
					locationId: transitId,
					quantity: -arrives,
					cost: m.cost
				});
				await move(ctx, {
					...base,
					kind: 'transfer_in',
					locationId: toId,
					quantity: arrives,
					cost: m.cost
				});
				if (m.serialUnitId) {
					await tx
						.update(serialUnit)
						.set({ locationId: toId })
						.where(eq(serialUnit.id, m.serialUnitId));
				}
			}
			if (q - arrives > 0) missing.push({ ...m, quantity: round4(q - arrives) });
		}

		const lostBase = round4(missing.reduce((s, m) => s + Number(m.quantity), 0));
		if (lostBase > 0) {
			const cost = await valueOut(ctx, it, lostBase);
			for (const m of missing) {
				await move(ctx, {
					kind: 'transit_loss',
					it,
					line,
					locationId: transitId,
					lotId: m.lotId,
					serialUnitId: m.serialUnitId,
					supplierId: m.supplierId,
					quantity: -Number(m.quantity),
					cost
				});
				if (m.serialUnitId) {
					await tx
						.update(serialUnit)
						.set({ status: 'disposed', locationId: null })
						.where(eq(serialUnit.id, m.serialUnitId));
				}
			}
			lost.push({ lineId: line.id, item: it.name, quantity: round4(lostBase / factor) });
		}

		await tx
			.update(stockDocumentLine)
			.set({
				receivedQuantity: round4(arrivedBase / factor),
				receivedSerials: arrivedSerials ? [...arrivedSerials].join('\n') || null : null
			})
			.where(eq(stockDocumentLine.id, line.id));
	}

	await tx
		.update(stockDocument)
		.set({
			status: 'posted',
			receivedAt: new Date(),
			receivedBy: userId ?? null,
			note: input.note ? [doc.note, `Received: ${input.note}`].filter(Boolean).join('\n') : doc.note
		})
		.where(eq(stockDocument.id, doc.id));

	return { lost };
}
