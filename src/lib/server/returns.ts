/**
 * Returns. Goods coming back from a customer (a customer return, against a posted sale) or going
 * back to a supplier (a return to supplier, against a posted receipt).
 *
 * A return is always made from the document it returns, never typed in: its lines are what that
 * document actually moved — per lot and serial, in base units — at the same price, cost and VAT.
 * That keeps three things right without anyone checking by hand:
 *   - stock comes back into the lot (and serial) it left from, or leaves from the lot it came in
 *   - the customer is credited, or the supplier debited, exactly what the original charged
 *   - nothing is returned twice: what is left to return is worked out from the ledger
 *
 * Imported by the posting service: plain database code only.
 */
import { and, eq, inArray, isNull, ne, sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import {
	item,
	itemUnit,
	lot,
	serialUnit,
	stockDocument,
	stockDocumentLine,
	stockMovement
} from '$lib/server/db/schema';

type Reader = Pick<typeof db, 'select'>;
type Writer = Pick<typeof db, 'select' | 'insert'>;

const round4 = (n: number) => Math.round(n * 10000) / 10000;

export class ReturnError extends Error {}

/**
 * What each line (and lot) of a posted document moved, and how much of it is already back.
 *
 * Services and kits move nothing under their own name: a service line is returnable in full, a
 * kit line as whole kits (its components come back with it, when the return is posted).
 */
export async function returnable(orgId: number, documentId: number, reader: Reader = db) {
	const docLines = await reader
		.select({
			id: stockDocumentLine.id,
			itemId: stockDocumentLine.itemId,
			uomId: stockDocumentLine.uomId,
			quantity: stockDocumentLine.quantity,
			stockTracked: item.stockTracked,
			baseUomId: item.baseUomId
		})
		.from(stockDocumentLine)
		.innerJoin(item, eq(item.id, stockDocumentLine.itemId))
		.where(
			and(
				eq(stockDocumentLine.documentId, documentId),
				eq(stockDocumentLine.orgId, orgId),
				isNull(stockDocumentLine.deletedAt)
			)
		);
	const unstocked = docLines.filter((l) => !l.stockTracked);
	const packs = unstocked.some((l) => l.uomId !== l.baseUomId)
		? await reader
				.select({ itemId: itemUnit.itemId, uomId: itemUnit.uomId, factor: itemUnit.factor })
				.from(itemUnit)
				.where(
					inArray(
						itemUnit.itemId,
						unstocked.map((l) => l.itemId)
					)
				)
		: [];

	const movedRows = await reader
		.select({
			lineId: stockMovement.documentLineId,
			itemId: stockMovement.itemId,
			lotId: stockMovement.lotId,
			quantity: sql<number>`ABS(SUM(${stockMovement.quantity}))`,
			value: sql<number>`ABS(SUM(${stockMovement.quantity} * ${stockMovement.unitCost}))`,
			serials: sql<
				string | null
			>`GROUP_CONCAT(${serialUnit.serialNumber} ORDER BY ${serialUnit.serialNumber} SEPARATOR '\n')`
		})
		.from(stockMovement)
		.leftJoin(serialUnit, eq(serialUnit.id, stockMovement.serialUnitId))
		.where(and(eq(stockMovement.orgId, orgId), eq(stockMovement.documentId, documentId)))
		.groupBy(stockMovement.documentLineId, stockMovement.itemId, stockMovement.lotId);

	// A kit's component movements are returned through the kit's line, not one by one.
	const itemOfLine = new Map(docLines.map((l) => [l.id, l.itemId]));
	const moved = movedRows.filter((m) => m.lineId !== null && itemOfLine.get(m.lineId) === m.itemId);
	for (const l of unstocked) {
		const factor =
			l.uomId === l.baseUomId
				? 1
				: (packs.find((p) => p.itemId === l.itemId && p.uomId === l.uomId)?.factor ?? 1);
		const componentValue = movedRows
			.filter((m) => m.lineId === l.id)
			.reduce((sum, m) => sum + Number(m.value), 0);
		moved.push({
			lineId: l.id,
			itemId: l.itemId,
			lotId: null,
			quantity: round4(l.quantity * factor),
			value: componentValue,
			serials: null
		});
	}

	const lineIds = moved.map((m) => m.lineId).filter((id): id is number => id !== null);
	const back = lineIds.length
		? await reader
				.select({
					lineId: stockDocumentLine.returnOfLineId,
					lotId: stockDocumentLine.lotId,
					quantity: sql<number>`SUM(${stockDocumentLine.quantity})`,
					serials: sql<string | null>`GROUP_CONCAT(${stockDocumentLine.serials} SEPARATOR '\n')`
				})
				.from(stockDocumentLine)
				.innerJoin(stockDocument, eq(stockDocument.id, stockDocumentLine.documentId))
				.where(
					and(
						inArray(stockDocumentLine.returnOfLineId, lineIds),
						eq(stockDocument.status, 'posted'),
						isNull(stockDocumentLine.deletedAt)
					)
				)
				.groupBy(stockDocumentLine.returnOfLineId, stockDocumentLine.lotId)
		: [];

	return moved.map((m) => {
		const done = back.find((b) => b.lineId === m.lineId && (b.lotId ?? 0) === (m.lotId ?? 0));
		const returnedSerials = new Set((done?.serials ?? '').split('\n').filter(Boolean));
		const serials = (m.serials ?? '').split('\n').filter(Boolean);
		const quantity = Number(m.quantity);
		return {
			lineId: m.lineId!,
			itemId: m.itemId,
			lotId: m.lotId,
			moved: quantity,
			left: Math.max(0, round4(quantity - Number(done?.quantity ?? 0))),
			/** Per base unit, what the stock was valued at when it moved. */
			cost: quantity ? round4(Number(m.value) / quantity) : 0,
			serialsLeft: serials.filter((s) => !returnedSerials.has(s))
		};
	});
}

/**
 * A draft return of everything still returnable on a posted sale or receipt. The storekeeper then
 * lowers the quantities (or removes lines) to what is actually coming back, and posts it.
 */
export async function createReturn(
	tx: Writer,
	input: { orgId: number; documentId: number; date: string; userId?: string }
): Promise<number> {
	const [orig] = await tx
		.select()
		.from(stockDocument)
		.where(and(eq(stockDocument.id, input.documentId), eq(stockDocument.orgId, input.orgId)));
	if (!orig) throw new ReturnError('That document does not exist.');
	if (orig.status !== 'posted') throw new ReturnError('Only a posted document can be returned.');
	if (orig.type !== 'issue' && orig.type !== 'receipt') {
		throw new ReturnError('Only sales and receipts can be returned.');
	}

	const [pending] = await tx
		.select({ id: stockDocument.id })
		.from(stockDocument)
		.where(and(eq(stockDocument.returnOfId, orig.id), eq(stockDocument.status, 'draft')));
	if (pending) {
		throw new ReturnError(
			`Draft return #${pending.id} is already open for this; post or cancel it first.`
		);
	}

	const left = (await returnable(input.orgId, orig.id, tx)).filter((r) => r.left > 0);
	if (!left.length) throw new ReturnError('Everything on this document has already been returned.');

	const lines = await tx
		.select()
		.from(stockDocumentLine)
		.where(
			inArray(
				stockDocumentLine.id,
				left.map((l) => l.lineId)
			)
		);
	const items = await tx
		.select({ id: item.id, baseUomId: item.baseUomId })
		.from(item)
		.where(
			inArray(
				item.id,
				left.map((l) => l.itemId)
			)
		);
	const factors = await tx
		.select({ itemId: itemUnit.itemId, uomId: itemUnit.uomId, factor: itemUnit.factor })
		.from(itemUnit)
		.where(
			inArray(
				itemUnit.itemId,
				left.map((l) => l.itemId)
			)
		);
	const lotIds = left.map((l) => l.lotId).filter((id): id is number => id !== null);
	const lots = lotIds.length ? await tx.select().from(lot).where(inArray(lot.id, lotIds)) : [];

	const isSale = orig.type === 'issue';
	const [created] = await tx
		.insert(stockDocument)
		.values({
			orgId: input.orgId,
			type: isSale ? 'sales_return' : 'purchase_return',
			branchId: orig.branchId,
			docDate: input.date,
			// Back where it left from; out of where it came in.
			toLocationId: isSale ? orig.fromLocationId : null,
			fromLocationId: isSale ? null : orig.toLocationId,
			customerId: isSale ? orig.customerId : null,
			supplierId: isSale ? null : orig.supplierId,
			party: isSale ? orig.party : null,
			returnOfId: orig.id,
			reference: orig.number,
			createdBy: input.userId
		})
		.$returningId();

	for (const r of left) {
		const line = lines.find((l) => l.id === r.lineId)!;
		const it = items.find((i) => i.id === r.itemId)!;
		const factor =
			line.uomId === it.baseUomId
				? 1
				: (factors.find((f) => f.itemId === it.id && f.uomId === line.uomId)?.factor ?? 1);
		const l = lots.find((x) => x.id === r.lotId);
		await tx.insert(stockDocumentLine).values({
			orgId: input.orgId,
			documentId: created.id,
			itemId: it.id,
			// Returns count in base units: a lot may have gone out in part of a pack.
			uomId: it.baseUomId,
			quantity: r.left,
			// A sale comes back at the price charged; a delivery goes back at the price paid.
			unitPrice: isSale && line.unitPrice !== null ? round4(line.unitPrice / factor) : null,
			// Stock returned by a customer comes back at what it cost when it left.
			unitCost: isSale ? r.cost : line.unitCost !== null ? round4(line.unitCost / factor) : r.cost,
			vatRate: line.vatRate,
			totRate: line.totRate,
			lotId: r.lotId,
			lotNumber: l?.lotNumber ?? null,
			expiryDate: l?.expiryDate ?? null,
			serials: r.serialsLeft.length ? r.serialsLeft.join('\n') : null,
			returnOfLineId: r.lineId
		});
	}
	return created.id;
}

/**
 * At posting: every line of a return returns part of a line of its original, and no more than is
 * left of it. Returns the refusal, or null.
 */
export async function checkReturn(
	reader: Reader,
	doc: { id: number; orgId: number; returnOfId: number | null; type: string },
	lines: {
		id: number;
		returnOfLineId: number | null;
		lotId: number | null;
		quantity: number;
		serials: string | null;
	}[]
): Promise<{ message: string; lineId?: number } | null> {
	if (!doc.returnOfId) return { message: 'A return must be made from the document it returns.' };
	const [orig] = await reader
		.select({ type: stockDocument.type, status: stockDocument.status })
		.from(stockDocument)
		.where(
			and(
				eq(stockDocument.id, doc.returnOfId),
				eq(stockDocument.orgId, doc.orgId),
				ne(stockDocument.status, 'cancelled')
			)
		);
	const expected = doc.type === 'sales_return' ? 'issue' : 'receipt';
	if (!orig || orig.status !== 'posted' || orig.type !== expected) {
		return { message: 'The document this returns is not a posted one of the right kind.' };
	}

	const left = await returnable(doc.orgId, doc.returnOfId, reader);
	for (const l of lines) {
		const r = left.find((x) => x.lineId === l.returnOfLineId && (x.lotId ?? 0) === (l.lotId ?? 0));
		if (!r) return { message: 'This line is not on the document being returned.', lineId: l.id };
		if (l.quantity > r.left + 0.00001) {
			return {
				message: `Only ${r.left} can still be returned on this line; it says ${l.quantity}.`,
				lineId: l.id
			};
		}
		const serials = (l.serials ?? '')
			.split('\n')
			.map((s) => s.trim())
			.filter(Boolean);
		const stranger = serials.find((s) => !r.serialsLeft.includes(s));
		if (stranger) {
			return {
				message: `Serial ${stranger} was not on the original, or has already been returned.`,
				lineId: l.id
			};
		}
	}
	return null;
}
