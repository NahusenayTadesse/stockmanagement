/**
 * Posting: the one way stock changes.
 *
 * A draft document is checked line by line and, if every line is possible, turned into ledger rows
 * (`stock_movement`) with the cached balances (`stock_balance`) moved to match — all in the
 * caller's transaction, so a document posts entirely or not at all. Any line that cannot be
 * posted throws `StockError` naming it, and nothing is written.
 *
 * Rules enforced here, not in the forms, because a form is only one way to reach this:
 *   - stock never goes negative; an issue larger than the shelf is refused, not clipped
 *   - expired, quarantined and recalled lots are never issued or sold — only written off by an
 *     adjustment, or transferred into a quarantine location
 *   - lot numbers, expiry dates and serial numbers are required where the item says so
 *   - expired stock cannot be received
 *   - the average cost moves only on stock coming in
 *   - a sale or receipt fixes each line's VAT rate; a return is checked against what is left of
 *     the document it returns
 */
import { and, eq, gt, inArray, isNull, sql } from 'drizzle-orm';
import { localToday } from '@nahu/admin-kit/time';
import type { db } from '$lib/server/db';
import {
	branch,
	item,
	itemUnit,
	location,
	lot,
	numberSequence,
	serialUnit,
	stockBalance,
	supplier,
	stockDocument,
	stockDocumentLine,
	stockMovement,
	uom,
	MOVEMENT_KINDS
} from '$lib/server/db/schema';
import { refreshOrderStatus } from '$lib/server/purchasing';
import { creditCheck } from '$lib/server/credit';
import { checkReturn } from '$lib/server/returns';
import { purchaseVatRate, saleTotRate, saleVatRate, taxSettings } from '$lib/server/tax';
import {
	allocate,
	DOCUMENT_PREFIX,
	ethiopianFiscalYear,
	isExpired,
	movingAverage,
	parseSerials,
	round4,
	toBase
} from './math';

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** A refusal the storekeeper can act on. `lineId` points at the line that caused it. */
export class StockError extends Error {
	constructor(
		message: string,
		readonly lineId?: number
	) {
		super(message);
		this.name = 'StockError';
	}
}

type Item = typeof item.$inferSelect;
type Line = typeof stockDocumentLine.$inferSelect;
type Doc = typeof stockDocument.$inferSelect;
type Kind = (typeof MOVEMENT_KINDS)[number];

type Context = {
	tx: Tx;
	orgId: number;
	doc: Doc;
	userId: string | undefined;
	today: string;
	units: Map<number, string>;
	locationNames: Map<number, string>;
};

export async function postDocument(
	tx: Tx,
	options: {
		orgId: number;
		documentId: number;
		userId?: string;
		today?: string;
		/** The poster may take a customer over their credit limit (`customers.credit`). */
		allowOverLimit?: boolean;
	}
): Promise<{ number: string }> {
	const { orgId, documentId, userId } = options;
	const today = options.today ?? localToday();

	// Locked first: two people pressing Post on the same draft must not both get through.
	const [doc] = await tx
		.select()
		.from(stockDocument)
		.where(and(eq(stockDocument.id, documentId), eq(stockDocument.orgId, orgId)))
		.for('update');

	if (!doc) throw new StockError('That document does not exist.');
	if (doc.status !== 'draft') throw new StockError(`This document is already ${doc.status}.`);

	const lines = await tx
		.select()
		.from(stockDocumentLine)
		.where(and(eq(stockDocumentLine.documentId, doc.id), isNull(stockDocumentLine.deletedAt)))
		.orderBy(stockDocumentLine.id);

	if (!lines.length) throw new StockError('Add at least one line before posting.');

	const locationIds = [doc.fromLocationId, doc.toLocationId].filter((id): id is number => !!id);
	const locations = locationIds.length
		? await tx
				.select()
				.from(location)
				.where(and(inArray(location.id, locationIds), eq(location.orgId, orgId)))
		: [];
	const locationById = new Map(locations.map((l) => [l.id, l]));
	const from = doc.fromLocationId ? locationById.get(doc.fromLocationId) : undefined;
	const to = doc.toLocationId ? locationById.get(doc.toLocationId) : undefined;

	switch (doc.type) {
		case 'receipt': {
			if (!to) throw new StockError('Choose where the goods are received.');
			// No supply without a supplier: every movement must be able to say where goods came from.
			if (!doc.supplierId) throw new StockError('Choose the supplier this delivery came from.');
			const [found] = await tx
				.select({ id: supplier.id })
				.from(supplier)
				.where(
					and(
						eq(supplier.id, doc.supplierId),
						eq(supplier.orgId, orgId),
						isNull(supplier.deletedAt)
					)
				);
			if (!found) throw new StockError('The supplier on this receipt no longer exists.');
			break;
		}
		case 'issue':
		case 'adjustment':
			if (!from) throw new StockError('Choose the location the stock is at.');
			break;
		case 'sales_return':
			if (!to) throw new StockError('Choose where the returned goods go.');
			break;
		case 'purchase_return':
			if (!from) throw new StockError('Choose where the goods leave from.');
			if (!doc.supplierId) throw new StockError('A return to supplier names the supplier.');
			break;
		case 'transfer':
			if (!from || !to) throw new StockError('Choose both locations for a transfer.');
			if (from.id === to.id) throw new StockError('A transfer needs two different locations.');
			break;
	}

	// Items are locked too: posting rewrites their average cost.
	const itemIds = [...new Set(lines.map((l) => l.itemId))];
	const items = await tx
		.select()
		.from(item)
		.where(and(inArray(item.id, itemIds), eq(item.orgId, orgId)))
		.for('update');
	const itemById = new Map(items.map((i) => [i.id, i]));

	const factors = await tx
		.select({ itemId: itemUnit.itemId, uomId: itemUnit.uomId, factor: itemUnit.factor })
		.from(itemUnit)
		.where(and(inArray(itemUnit.itemId, itemIds), isNull(itemUnit.deletedAt)));

	const units = new Map(
		(await tx.select({ id: uom.id, symbol: uom.symbol }).from(uom).where(eq(uom.orgId, orgId))).map(
			(u) => [u.id, u.symbol]
		)
	);

	// Sales and receipts: the VAT on each line is fixed now, at this business's and this supplier's
	// registration and the item's tax code. Returns carry the rate of the line they return.
	if (doc.type === 'issue' || doc.type === 'receipt') {
		const settings = await taxSettings(orgId, tx);
		let supplierVat = false;
		if (doc.type === 'receipt' && doc.supplierId) {
			const [s] = await tx
				.select({ vat: supplier.vatRegistered })
				.from(supplier)
				.where(eq(supplier.id, doc.supplierId));
			supplierVat = s?.vat ?? false;
		}
		for (const line of lines) {
			const it = itemById.get(line.itemId);
			if (!it) continue;
			const rate =
				doc.type === 'issue'
					? saleVatRate(settings, it.taxCode)
					: purchaseVatRate(settings, supplierVat, it.taxCode);
			// TOT: sales only, by a TOT payer that is not VAT-registered.
			const tot = doc.type === 'issue' ? saleTotRate(settings, it.totRate) : null;
			if (line.vatRate !== rate || line.totRate !== tot) {
				await tx
					.update(stockDocumentLine)
					.set({ vatRate: rate, totRate: tot })
					.where(eq(stockDocumentLine.id, line.id));
				line.vatRate = rate;
				line.totRate = tot;
			}
		}
	}

	// A sale to a named customer is what they owe: priced, and within their credit limit.
	if (doc.type === 'issue' && doc.customerId) {
		const refused = await creditCheck(tx, {
			orgId,
			documentId: doc.id,
			customerId: doc.customerId,
			allowOverLimit: options.allowOverLimit ?? false
		});
		if (refused) throw new StockError(refused);
	}

	if (doc.type === 'sales_return' || doc.type === 'purchase_return') {
		const refused = await checkReturn(tx, doc, lines);
		if (refused) throw new StockError(refused.message, refused.lineId);
	}

	const ctx: Context = {
		tx,
		orgId,
		doc,
		userId,
		today,
		units,
		locationNames: new Map(locations.map((l) => [l.id, l.name]))
	};

	for (const line of lines) {
		const it = itemById.get(line.itemId);
		if (!it) throw new StockError('This line names an item that no longer exists.', line.id);
		if (!it.stockTracked) {
			throw new StockError(`${it.name} is a service and is not counted in stock.`, line.id);
		}

		const factor =
			line.uomId === it.baseUomId
				? 1
				: factors.find((f) => f.itemId === it.id && f.uomId === line.uomId)?.factor;
		if (!factor) {
			throw new StockError(
				`${it.name} has no conversion for the unit on this line. Add it on the item first.`,
				line.id
			);
		}

		const quantity = toBase(line.quantity, factor);
		if (quantity === 0) throw new StockError(`The quantity for ${it.name} is zero.`, line.id);
		if (quantity < 0 && doc.type !== 'adjustment') {
			throw new StockError(`The quantity for ${it.name} must be positive.`, line.id);
		}

		const { serials, duplicates } = parseSerials(line.serials);
		if (duplicates.length) {
			throw new StockError(`Serial ${duplicates.join(', ')} is entered twice.`, line.id);
		}
		if (it.trackSerials) {
			if (!Number.isInteger(quantity) || serials.length !== Math.abs(quantity)) {
				throw new StockError(
					`${it.name} is tracked by serial number: enter exactly ${Math.abs(quantity)} serial number(s).`,
					line.id
				);
			}
		} else if (serials.length) {
			throw new StockError(`${it.name} is not tracked by serial number.`, line.id);
		}

		const cost = line.unitCost == null ? it.avgCost : round4(line.unitCost / factor);
		// A receipt with no cost came in at the average cost: say so on the line, so what the
		// supplier is owed can always be read off the document.
		if (doc.type === 'receipt' && line.unitCost == null) {
			await tx
				.update(stockDocumentLine)
				.set({ unitCost: round4(cost * factor) })
				.where(eq(stockDocumentLine.id, line.id));
		}

		switch (doc.type) {
			case 'receipt':
				await bringIn(ctx, it, line, to!.id, quantity, cost, serials, 'receipt');
				break;
			case 'adjustment':
				if (quantity > 0) {
					await bringIn(ctx, it, line, from!.id, quantity, cost, serials, 'adjustment_in');
				} else {
					// A write-off: expired, quarantined and recalled stock is exactly what leaves this way.
					await takeOut(ctx, it, line, from!.id, -quantity, serials, 'adjustment_out', {
						allowUnusable: true
					});
				}
				break;
			case 'issue':
				await takeOut(ctx, it, line, from!.id, quantity, serials, 'issue');
				break;
			case 'transfer':
				await takeOut(ctx, it, line, from!.id, quantity, serials, 'transfer_out', {
					allowUnusable: to!.kind === 'quarantine',
					transferTo: to!.id
				});
				break;
			case 'sales_return':
				// Back into its own lot, even an expired one: that is often why it came back.
				await bringIn(ctx, it, line, to!.id, quantity, cost, serials, 'sales_return', {
					acceptExpired: true
				});
				break;
			case 'purchase_return':
				// Expired, quarantined and recalled stock is exactly what goes back to a supplier.
				await takeOut(ctx, it, line, from!.id, quantity, serials, 'purchase_return', {
					allowUnusable: true
				});
				break;
		}
	}

	const number = await nextNumber(tx, doc, orgId);

	await tx
		.update(stockDocument)
		.set({ status: 'posted', number, postedAt: new Date(), postedBy: userId ?? null })
		.where(eq(stockDocument.id, doc.id));

	// A delivery against an order moves the order along: partly or wholly received.
	if (doc.type === 'receipt' && doc.purchaseOrderId) {
		await refreshOrderStatus(tx, orgId, doc.purchaseOrderId);
	}

	return { number };
}

/** Stock arriving: a receipt or a positive adjustment. */
async function bringIn(
	ctx: Context,
	it: Item,
	line: Line,
	locationId: number,
	quantity: number,
	cost: number,
	serials: string[],
	kind: Kind,
	options: { acceptExpired?: boolean } = {}
) {
	const { tx, orgId, today, doc } = ctx;
	let lotId: number | null = null;
	/**
	 * Who these goods came from. A receipt says so. Stock found on a count has no delivery behind
	 * it, so it is credited to the supplier of the lot it joins, or the item's main supplier.
	 */
	let supplierId: number | null = doc.type === 'receipt' ? doc.supplierId : null;

	if (it.trackLots || it.trackExpiry) {
		const lotNumber = line.lotNumber?.trim();
		if (!lotNumber) throw new StockError(`Enter the lot/batch number for ${it.name}.`, line.id);
		if (it.trackExpiry && !line.expiryDate) {
			throw new StockError(`Enter the expiry date for ${it.name}.`, line.id);
		}
		if (!options.acceptExpired && isExpired(line.expiryDate, today)) {
			throw new StockError(
				`Lot ${lotNumber} of ${it.name} expired on ${line.expiryDate} and cannot be received.`,
				line.id
			);
		}
		const resolved = await resolveLot(
			tx,
			orgId,
			it,
			lotNumber,
			line.expiryDate ?? null,
			line.id,
			supplierId ?? it.supplierId
		);
		lotId = resolved.id;
		supplierId ??= resolved.supplierId;
	}
	supplierId ??= it.supplierId;
	if (!supplierId) {
		throw new StockError(`${it.name} has no main supplier. Set one on the item first.`, line.id);
	}

	// The average is taken over everything on hand before this line arrives, everywhere.
	const [{ onHand }] = await tx
		.select({ onHand: sql<number>`COALESCE(SUM(${stockBalance.quantity}), 0)` })
		.from(stockBalance)
		.where(and(eq(stockBalance.itemId, it.id), eq(stockBalance.orgId, orgId)));
	const newAvg = movingAverage(Number(onHand), it.avgCost, quantity, cost);
	if (newAvg !== it.avgCost) {
		await tx.update(item).set({ avgCost: newAvg }).where(eq(item.id, it.id));
		it.avgCost = newAvg; // later lines of the same item average on top of this one
	}

	if (it.trackSerials) {
		for (const serialNumber of serials) {
			const serialUnitId = await receiveSerial(
				ctx,
				it,
				serialNumber,
				locationId,
				lotId,
				supplierId,
				line.id
			);
			await move(ctx, {
				kind,
				it,
				line,
				locationId,
				lotId,
				serialUnitId,
				supplierId,
				quantity: 1,
				cost
			});
		}
	} else {
		await move(ctx, {
			kind,
			it,
			line,
			locationId,
			lotId,
			serialUnitId: null,
			supplierId,
			quantity,
			cost
		});
	}
}

/** Stock leaving: an issue, a transfer (out and back in), or a write-off. */
async function takeOut(
	ctx: Context,
	it: Item,
	line: Line,
	locationId: number,
	quantity: number,
	serials: string[],
	kind: Kind,
	options: { allowUnusable?: boolean; transferTo?: number } = {}
) {
	const { tx, orgId, today } = ctx;
	const cost = it.avgCost;

	if (it.trackSerials) {
		for (const serialNumber of serials) {
			const [unit] = await tx
				.select()
				.from(serialUnit)
				.where(
					and(
						eq(serialUnit.orgId, orgId),
						eq(serialUnit.itemId, it.id),
						eq(serialUnit.serialNumber, serialNumber)
					)
				)
				.for('update');

			if (!unit || unit.status !== 'in_stock' || unit.locationId !== locationId) {
				throw new StockError(
					`Serial ${serialNumber} of ${it.name} is not in stock at ${ctx.locationNames.get(locationId)}.`,
					line.id
				);
			}

			if (!options.allowUnusable && unit.lotId) {
				const [l] = await tx.select().from(lot).where(eq(lot.id, unit.lotId));
				if (l && (l.status !== 'available' || isExpired(l.expiryDate, today))) {
					throw new StockError(
						`Serial ${serialNumber} belongs to lot ${l.lotNumber}, which is ${l.status === 'available' ? 'expired' : l.status}.`,
						line.id
					);
				}
			}

			// The unit knows who delivered it; older units fall back to their lot, then the item.
			let unitSupplier = unit.supplierId;
			if (!unitSupplier && unit.lotId) {
				const [l] = await tx
					.select({ supplierId: lot.supplierId })
					.from(lot)
					.where(eq(lot.id, unit.lotId));
				unitSupplier = l?.supplierId ?? null;
			}
			const supplierId = requireSupplier(unitSupplier ?? it.supplierId, it, line);

			await move(ctx, {
				kind,
				it,
				line,
				locationId,
				lotId: unit.lotId,
				serialUnitId: unit.id,
				supplierId,
				quantity: -1,
				cost
			});
			if (options.transferTo) {
				await move(ctx, {
					kind: 'transfer_in',
					it,
					line,
					locationId: options.transferTo,
					lotId: unit.lotId,
					serialUnitId: unit.id,
					supplierId,
					quantity: 1,
					cost
				});
			}

			await tx
				.update(serialUnit)
				.set(
					options.transferTo
						? { locationId: options.transferTo }
						: {
								status:
									kind === 'issue'
										? 'issued'
										: kind === 'purchase_return'
											? 'returned'
											: 'disposed',
								locationId: null
							}
				)
				.where(eq(serialUnit.id, unit.id));
		}
		return;
	}

	// Every balance row this item has here, locked, with what the lot says about itself.
	const rows = await tx
		.select({
			lotId: stockBalance.lotId,
			quantity: stockBalance.quantity,
			expiryDate: lot.expiryDate,
			status: lot.status,
			lotSupplierId: lot.supplierId
		})
		.from(stockBalance)
		.leftJoin(lot, eq(lot.id, stockBalance.lotId))
		.where(
			and(
				eq(stockBalance.locationId, locationId),
				eq(stockBalance.itemId, it.id),
				gt(stockBalance.quantity, 0)
			)
		)
		.for('update');

	const { takes, short } = allocate(
		rows.map((r) => ({ ...r, quantity: Number(r.quantity) })),
		quantity,
		{ today, allowUnusable: options.allowUnusable, lotId: line.lotId }
	);

	if (short > 0) {
		const available = round4(quantity - short);
		const unit = ctx.units.get(it.baseUomId) ?? '';
		throw new StockError(
			`Only ${available} ${unit} of ${it.name} ${line.lotId ? 'in that lot ' : ''}can be taken from ${ctx.locationNames.get(locationId)}; the line needs ${quantity} ${unit}.` +
				(options.allowUnusable ? '' : ' Expired, quarantined and recalled lots are not counted.'),
			line.id
		);
	}

	for (const take of takes) {
		// A lot knows who delivered it. Stock without lots is credited to the item's main supplier —
		// the one place this is an approximation, since such stock is not kept apart by supplier.
		const lotSupplier = rows.find((r) => r.lotId === take.lotId)?.lotSupplierId ?? null;
		const supplierId = requireSupplier(lotSupplier ?? it.supplierId, it, line);

		await move(ctx, {
			kind,
			it,
			line,
			locationId,
			lotId: take.lotId,
			serialUnitId: null,
			supplierId,
			quantity: -take.quantity,
			cost
		});
		if (options.transferTo) {
			await move(ctx, {
				kind: 'transfer_in',
				it,
				line,
				locationId: options.transferTo,
				lotId: take.lotId,
				serialUnitId: null,
				supplierId,
				quantity: take.quantity,
				cost
			});
		}
	}
}

function requireSupplier(supplierId: number | null, it: Item, line: Line): number {
	if (!supplierId) {
		throw new StockError(`${it.name} has no main supplier. Set one on the item first.`, line.id);
	}
	return supplierId;
}

/** One ledger row, and the balance it changes. */
async function move(
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
) {
	const { tx, orgId, doc, userId } = ctx;

	await tx.insert(stockMovement).values({
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
		docDate: doc.docDate,
		createdBy: userId ?? null
	});

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
}

/**
 * The lot a receipt names. A lot number seen before for this item is the same lot — a second
 * delivery of it — unless the expiry dates disagree, which means one of them was typed wrong.
 */
async function resolveLot(
	tx: Tx,
	orgId: number,
	it: Item,
	lotNumber: string,
	expiryDate: string | null,
	lineId: number,
	/** Who is delivering it now; kept on the lot the first time it is seen. */
	supplierId: number | null
): Promise<{ id: number; supplierId: number | null }> {
	const [existing] = await tx
		.select()
		.from(lot)
		.where(and(eq(lot.itemId, it.id), eq(lot.lotNumber, lotNumber)))
		.for('update');

	if (existing) {
		if (existing.expiryDate && expiryDate && existing.expiryDate !== expiryDate) {
			throw new StockError(
				`Lot ${lotNumber} of ${it.name} is already recorded as expiring ${existing.expiryDate}, not ${expiryDate}. Check the pack.`,
				lineId
			);
		}
		if ((!existing.expiryDate && expiryDate) || (!existing.supplierId && supplierId)) {
			await tx
				.update(lot)
				.set({
					expiryDate: existing.expiryDate ?? expiryDate,
					supplierId: existing.supplierId ?? supplierId
				})
				.where(eq(lot.id, existing.id));
		}
		return { id: existing.id, supplierId: existing.supplierId ?? supplierId };
	}

	const [created] = await tx
		.insert(lot)
		.values({ orgId, itemId: it.id, lotNumber, expiryDate, supplierId })
		.$returningId();
	return { id: created.id, supplierId };
}

/** A serial number coming (back) into stock. */
async function receiveSerial(
	ctx: Context,
	it: Item,
	serialNumber: string,
	locationId: number,
	lotId: number | null,
	supplierId: number,
	lineId: number
): Promise<number> {
	const { tx, orgId } = ctx;
	const [existing] = await tx
		.select()
		.from(serialUnit)
		.where(and(eq(serialUnit.itemId, it.id), eq(serialUnit.serialNumber, serialNumber)))
		.for('update');

	if (existing) {
		if (existing.status === 'in_stock') {
			throw new StockError(`Serial ${serialNumber} of ${it.name} is already in stock.`, lineId);
		}
		// Back from a customer or from repair: the same physical unit, so the same row.
		await tx
			.update(serialUnit)
			.set({
				status: 'in_stock',
				locationId,
				lotId: lotId ?? existing.lotId,
				// It is still the unit the original supplier delivered.
				supplierId: existing.supplierId ?? supplierId
			})
			.where(eq(serialUnit.id, existing.id));
		return existing.id;
	}

	const [created] = await tx
		.insert(serialUnit)
		.values({
			orgId,
			itemId: it.id,
			serialNumber,
			lotId,
			supplierId,
			locationId,
			status: 'in_stock'
		})
		.$returningId();
	return created.id;
}

/** The next number in this branch's sequence for this kind of document and fiscal year. */
async function nextNumber(tx: Tx, doc: Doc, orgId: number): Promise<string> {
	return issueNumber(tx, {
		orgId,
		branchId: doc.branchId,
		sequence: doc.type,
		prefix: DOCUMENT_PREFIX[doc.type],
		date: doc.docDate
	});
}

/**
 * The next number in a branch's sequence for one kind of paper and Ethiopian fiscal year:
 * `ADD-GRN-2019-00042`. Shared by stock documents and purchase orders.
 */
export async function issueNumber(
	tx: Tx,
	input: { orgId: number; branchId: number; sequence: string; prefix: string; date: string }
): Promise<string> {
	const fiscalYear = ethiopianFiscalYear(input.date);

	// Make sure the row exists, then lock it. Two steps, because a locking read of a row that is
	// not there yet locks nothing.
	await tx
		.insert(numberSequence)
		.values({
			orgId: input.orgId,
			branchId: input.branchId,
			docType: input.sequence,
			fiscalYear,
			lastNumber: 0
		})
		.onDuplicateKeyUpdate({ set: { lastNumber: sql`${numberSequence.lastNumber}` } });

	const [seq] = await tx
		.select()
		.from(numberSequence)
		.where(
			and(
				eq(numberSequence.branchId, input.branchId),
				eq(numberSequence.docType, input.sequence),
				eq(numberSequence.fiscalYear, fiscalYear)
			)
		)
		.for('update');

	const n = seq.lastNumber + 1;
	await tx.update(numberSequence).set({ lastNumber: n }).where(eq(numberSequence.id, seq.id));

	const [b] = await tx
		.select({ code: branch.code })
		.from(branch)
		.where(eq(branch.id, input.branchId));
	return `${b.code}-${input.prefix}-${fiscalYear}-${String(n).padStart(5, '0')}`;
}
