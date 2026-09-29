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
 *   - stock held for an accepted proforma or approved requisition is not issued to anyone else
 *   - a transfer to another branch goes into transit, and arrives only when that branch receives it
 *   - adjustments over the business's limits, and write-offs if it says so, wait for approval
 *   - services are sold without touching stock; a kit or recipe takes its components
 *   - a delivery with less shelf life left than its category allows is flagged, or refused
 */
import { and, eq, gt, inArray, isNull, sql } from 'drizzle-orm';
import { localToday } from '@nahu/admin-kit/time';
import {
	branch,
	category,
	item,
	itemUnit,
	kitComponent,
	landedCost,
	location,
	lot,
	numberSequence,
	organization,
	requisition,
	serialUnit,
	stockBalance,
	supplier,
	stockDocument,
	stockDocumentLine,
	stockMovement,
	uom
} from '$lib/server/db/schema';
import { refreshOrderStatus } from '$lib/server/purchasing';
import { creditCheck } from '$lib/server/credit';
import { checkReturn } from '$lib/server/returns';
import { purchaseVatRate, saleTotRate, saleVatRate, taxSettings } from '$lib/server/tax';
import { releaseQuote, releaseRequisition, reservedElsewhere } from '$lib/server/reservations';
import {
	allocate,
	DOCUMENT_PREFIX,
	ethiopianFiscalYear,
	isExpired,
	parseSerials,
	round4,
	toBase
} from './math';
import { ApprovalRequired, StockError } from './errors';
import {
	move,
	valueIn,
	valueOut,
	type Context as LedgerContext,
	type Doc,
	type Item,
	type Kind,
	type Line,
	type Tx
} from './ledger';
import { ensureTransitLocation } from './transit';

export { ApprovalRequired, StockError };
export type { Tx };

type Context = LedgerContext & {
	/** Per item: the least shelf life a delivery may have, from its category. */
	shelfLife: Map<number, { days: number; refuse: boolean }>;
};

const DAY = 86_400_000;
const money = (n: number) =>
	n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export async function postDocument(
	tx: Tx,
	options: {
		orgId: number;
		documentId: number;
		userId?: string;
		today?: string;
		/** The poster may take a customer over their credit limit (`customers.credit`). */
		allowOverLimit?: boolean;
		/**
		 * Already approved, or checked elsewhere: an approver posting it, a count (which has its
		 * own limit), an opening-stock import. Skips the adjustment approval rules.
		 */
		approved?: boolean;
	}
): Promise<{ number: string; status: 'posted' | 'in_transit'; warnings: string[] }> {
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
	const [org] = await tx
		.select({
			costing: organization.costingMethod,
			approveAdjustmentsOver: organization.approveAdjustmentsOver,
			approveWriteOffs: organization.approveWriteOffs
		})
		.from(organization)
		.where(eq(organization.id, orgId));
	/** A transfer to another branch: out now, in when that branch says it arrived. */
	let transitId: number | null = null;

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
			if (from.kind === 'transit' || to.kind === 'transit') {
				throw new StockError('Stock in transit moves only by being received.');
			}
			if (from.branchId !== to.branchId) {
				transitId = await ensureTransitLocation(tx, orgId, to.branchId);
			}
			break;
	}
	if (from?.kind === 'transit' && doc.type !== 'transfer') {
		throw new StockError('Stock in transit moves only by being received.');
	}

	// Kits and recipes leave as their components.
	const lineItemIds = [...new Set(lines.map((l) => l.itemId))];
	const components = await tx
		.select()
		.from(kitComponent)
		.where(
			and(
				inArray(kitComponent.kitItemId, lineItemIds),
				eq(kitComponent.orgId, orgId),
				isNull(kitComponent.deletedAt)
			)
		);

	// Items are locked too: posting rewrites their average cost.
	const itemIds = [...new Set([...lineItemIds, ...components.map((c) => c.componentItemId)])];
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
	const factorOf = (it: Item, uomId: number) =>
		uomId === it.baseUomId
			? 1
			: factors.find((f) => f.itemId === it.id && f.uomId === uomId)?.factor;

	// Receipts: the least shelf life each item's category accepts.
	const shelfLife = new Map<number, { days: number; refuse: boolean }>();
	if (doc.type === 'receipt') {
		const categoryIds = [
			...new Set(items.map((i) => i.categoryId).filter((id): id is number => !!id))
		];
		const rules = categoryIds.length
			? await tx
					.select({
						id: category.id,
						days: category.minShelfLifeDays,
						refuse: category.refuseShortShelfLife
					})
					.from(category)
					.where(inArray(category.id, categoryIds))
			: [];
		for (const it of items) {
			const rule = rules.find((r) => r.id === it.categoryId);
			if (rule?.days) shelfLife.set(it.id, { days: rule.days, refuse: rule.refuse });
		}
	}

	// Maker-checker: an adjustment over the limit, or a write-off when the business says so.
	if (doc.type === 'adjustment' && !options.approved) {
		let value = 0;
		for (const line of lines) {
			const it = itemById.get(line.itemId);
			const factor = it && factorOf(it, line.uomId);
			if (!it || !factor) continue;
			const cost = line.unitCost == null ? it.avgCost : line.unitCost / factor;
			value += Math.abs(toBase(line.quantity, factor)) * cost;
		}
		value = Math.round(value * 100) / 100;
		const writesOff = lines.some((l) => l.quantity < 0);
		const limit = org?.approveAdjustmentsOver ?? null;
		const reason =
			org?.approveWriteOffs && writesOff
				? 'it writes stock off'
				: limit !== null && value >= limit
					? `it is worth ${money(value)} at cost, over the ${money(limit)} limit`
					: null;
		if (reason) throw new ApprovalRequired('adjustment', value, reason);
	}

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

	// Receipts: freight, duty and the rest shared over the lines, in birr per line.
	const landed =
		doc.type === 'receipt' ? await shareLandedCosts(tx, doc.id, lines, itemById, factorOf) : null;

	const ctx: Context = {
		tx,
		orgId,
		doc,
		userId,
		today,
		moveDate: doc.docDate,
		costing: org?.costing === 'fifo' ? 'fifo' : 'average',
		units,
		locationNames: new Map(locations.map((l) => [l.id, l.name])),
		warnings: [],
		shelfLife
	};

	for (const line of lines) {
		const it = itemById.get(line.itemId);
		if (!it) throw new StockError('This line names an item that no longer exists.', line.id);

		const factor = factorOf(it, line.uomId);
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

		// Services and kits have no stock of their own: sold (or returned) without a movement,
		// except that a kit's components leave the shelf (or come back to it).
		if (!it.stockTracked) {
			if (doc.type !== 'issue' && doc.type !== 'sales_return') {
				throw new StockError(`${it.name} is not stocked, so it cannot be moved.`, line.id);
			}
			if (it.isKit && doc.type === 'issue') {
				await kitOut(ctx, it, line, from!.id, quantity, components, itemById, factorOf);
			} else if (it.isKit) {
				await kitBack(ctx, it, line, to!.id, quantity, itemById, factorOf);
			}
			continue;
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

		let cost = line.unitCost == null ? it.avgCost : round4(line.unitCost / factor);
		// A receipt with no cost came in at the average cost: say so on the line, so what the
		// supplier is owed can always be read off the document.
		if (doc.type === 'receipt' && line.unitCost == null) {
			await tx
				.update(stockDocumentLine)
				.set({ unitCost: round4(cost * factor) })
				.where(eq(stockDocumentLine.id, line.id));
		}
		// What it took to bring it in is part of what it cost.
		if (landed?.has(line.id)) cost = round4(cost + landed.get(line.id)! / quantity);

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
					transferTo: transitId ?? to!.id
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
	const status = transitId ? 'in_transit' : 'posted';

	await tx
		.update(stockDocument)
		.set({
			status,
			number,
			postedAt: new Date(),
			postedBy: userId ?? null,
			transitLocationId: transitId
		})
		.where(eq(stockDocument.id, doc.id));

	// A delivery against an order moves the order along: partly or wholly received.
	if (doc.type === 'receipt' && doc.purchaseOrderId) {
		await refreshOrderStatus(tx, orgId, doc.purchaseOrderId);
	}

	// What was held for this sale or issue has now been taken.
	if (doc.type === 'issue' && doc.quoteId) await releaseQuote(tx, doc.quoteId);
	if (doc.type === 'issue' && doc.requisitionId) {
		await releaseRequisition(tx, doc.requisitionId);
		await tx
			.update(requisition)
			.set({ status: 'issued', issueId: doc.id })
			.where(and(eq(requisition.id, doc.requisitionId), eq(requisition.orgId, orgId)));
	}

	return { number, status, warnings: ctx.warnings };
}

/**
 * A receipt's landed costs, shared over its lines by each cost's method: by value (quantity ×
 * cost), by quantity (base units), or by weight (base units × the item's weight). In birr per
 * line; written onto the lines so the receipt shows it. Null when there are none.
 */
async function shareLandedCosts(
	tx: Tx,
	documentId: number,
	lines: Line[],
	itemById: Map<number, Item>,
	factorOf: (it: Item, uomId: number) => number | undefined
): Promise<Map<number, number> | null> {
	const costs = await tx
		.select()
		.from(landedCost)
		.where(and(eq(landedCost.documentId, documentId), isNull(landedCost.deletedAt)));

	const shares = new Map<number, number>(lines.map((l) => [l.id, 0]));
	for (const c of costs) {
		const weights = lines.map((l) => {
			const it = itemById.get(l.itemId)!;
			const base = toBase(l.quantity, factorOf(it, l.uomId) ?? 1);
			if (c.method === 'quantity') return base;
			if (c.method === 'weight') {
				if (it.weightKg == null) {
					throw new StockError(
						`Give ${it.name} a weight on its page, or share the ${c.kind} by value.`,
						l.id
					);
				}
				return base * it.weightKg;
			}
			return l.quantity * (l.unitCost ?? it.avgCost * (factorOf(it, l.uomId) ?? 1));
		});
		const total = weights.reduce((s, w) => s + w, 0);
		if (total <= 0) {
			throw new StockError(`There is nothing to share the ${c.kind} over. Give the lines costs.`);
		}
		// The last line takes the rounding, so the lines add up to the cost exactly.
		let given = 0;
		lines.forEach((l, i) => {
			const part =
				i === lines.length - 1 ? round4(c.amount - given) : round4((c.amount * weights[i]) / total);
			given = round4(given + part);
			shares.set(l.id, round4(shares.get(l.id)! + part));
		});
	}

	for (const l of lines) {
		const share = costs.length ? shares.get(l.id)! : null;
		if (l.landedCost !== share) {
			await tx
				.update(stockDocumentLine)
				.set({ landedCost: share })
				.where(eq(stockDocumentLine.id, l.id));
		}
	}
	return costs.length ? shares : null;
}

/** A kit or recipe sold: each of its components leaves the shelf, on the kit's line. */
async function kitOut(
	ctx: Context,
	kit: Item,
	line: Line,
	locationId: number,
	kitQuantity: number,
	components: (typeof kitComponent.$inferSelect)[],
	itemById: Map<number, Item>,
	factorOf: (it: Item, uomId: number) => number | undefined
) {
	const parts = components.filter((c) => c.kitItemId === kit.id);
	if (!parts.length) {
		throw new StockError(`${kit.name} has no components. Add them on its page.`, line.id);
	}
	for (const c of parts) {
		const comp = itemById.get(c.componentItemId);
		if (!comp) throw new StockError(`A component of ${kit.name} no longer exists.`, line.id);
		if (!comp.stockTracked) continue;
		if (comp.trackSerials) {
			throw new StockError(
				`${comp.name} is tracked by serial number and cannot be part of ${kit.name}.`,
				line.id
			);
		}
		const factor = factorOf(comp, c.uomId);
		if (!factor) {
			throw new StockError(`${comp.name} has no conversion for its unit in ${kit.name}.`, line.id);
		}
		const quantity = round4(kitQuantity * c.quantity * factor);
		if (quantity <= 0) continue;
		// The line's lot is the kit's (none): components go first-expiry-first-out.
		await takeOut(ctx, comp, { ...line, lotId: null }, locationId, quantity, [], 'issue');
	}
}

/**
 * A kit or recipe returned: its components come back, in proportion to what was sold, into the
 * lots they left from, at what they cost when they left.
 */
async function kitBack(
	ctx: Context,
	kit: Item,
	line: Line,
	locationId: number,
	kitQuantity: number,
	itemById: Map<number, Item>,
	factorOf: (it: Item, uomId: number) => number | undefined
) {
	const { tx } = ctx;
	if (!line.returnOfLineId) {
		throw new StockError(`A returned ${kit.name} must come from the sale it was on.`, line.id);
	}
	const [original] = await tx
		.select({ quantity: stockDocumentLine.quantity, uomId: stockDocumentLine.uomId })
		.from(stockDocumentLine)
		.where(eq(stockDocumentLine.id, line.returnOfLineId));
	const sold = original ? toBase(original.quantity, factorOf(kit, original.uomId) ?? 1) : 0;
	if (!sold) throw new StockError(`The sale of ${kit.name} being returned was not found.`, line.id);

	const moved = await tx
		.select({
			itemId: stockMovement.itemId,
			lotId: stockMovement.lotId,
			supplierId: stockMovement.supplierId,
			quantity: sql<number>`-SUM(${stockMovement.quantity})`,
			value: sql<number>`-SUM(${stockMovement.quantity} * ${stockMovement.unitCost})`
		})
		.from(stockMovement)
		.where(
			and(eq(stockMovement.documentLineId, line.returnOfLineId), eq(stockMovement.kind, 'issue'))
		)
		.groupBy(stockMovement.itemId, stockMovement.lotId, stockMovement.supplierId);

	const missing = moved.map((m) => m.itemId).filter((id) => !itemById.has(id));
	if (missing.length) {
		const more = await tx
			.select()
			.from(item)
			.where(inArray(item.id, [...new Set(missing)]))
			.for('update');
		for (const it of more) itemById.set(it.id, it);
	}

	const share = kitQuantity / sold;
	for (const m of moved) {
		const comp = itemById.get(m.itemId)!;
		const out = Number(m.quantity);
		const back = round4(out * share);
		if (back <= 0) continue;
		const cost = round4(Number(m.value) / out);
		await valueIn(ctx, comp, back, cost);
		await move(ctx, {
			kind: 'sales_return',
			it: comp,
			line,
			locationId,
			lotId: m.lotId,
			serialUnitId: null,
			supplierId: m.supplierId,
			quantity: back,
			cost
		});
	}
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
		// A delivery that will not last long enough on the shelf: flagged, or refused.
		const rule = ctx.shelfLife.get(it.id);
		if (doc.type === 'receipt' && rule && line.expiryDate) {
			const daysLeft = Math.round((Date.parse(line.expiryDate) - Date.parse(today)) / DAY);
			if (daysLeft < rule.days) {
				const text = `Lot ${lotNumber} of ${it.name} has ${daysLeft} day(s) of shelf life left; its category wants at least ${rule.days}.`;
				if (rule.refuse) throw new StockError(`${text} Refuse the delivery.`, line.id);
				ctx.warnings.push(text);
			}
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

	// The item's value takes this in: the moving average, or a new FIFO layer.
	await valueIn(ctx, it, quantity, cost);

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
	const { tx, orgId, today, doc } = ctx;
	// Moving stock between shelves does not change what it cost; stock leaving the business is
	// valued now (the average, or the oldest FIFO layers).
	const leaves = kind !== 'transfer_out';
	// Stock promised to someone else stays: issues and transfers may not dip into it.
	const held =
		(kind === 'issue' || kind === 'transfer_out') && !options.allowUnusable
			? await reservedElsewhere(tx, {
					orgId,
					itemId: it.id,
					locationId,
					today,
					quoteId: doc.quoteId,
					requisitionId: doc.requisitionId
				})
			: 0;
	const unit = ctx.units.get(it.baseUomId) ?? '';
	const heldError = (free: number) =>
		new StockError(
			`Only ${Math.max(0, round4(free))} ${unit} of ${it.name} is free at ${ctx.locationNames.get(locationId)}: ${held} ${unit} is held for accepted proformas or approved requisitions.`,
			line.id
		);

	if (it.trackSerials) {
		if (held > 0) {
			const [{ n }] = await tx
				.select({ n: sql<number>`COUNT(*)` })
				.from(serialUnit)
				.where(
					and(
						eq(serialUnit.itemId, it.id),
						eq(serialUnit.locationId, locationId),
						eq(serialUnit.status, 'in_stock')
					)
				);
			if (Number(n) - held < serials.length) throw heldError(Number(n) - held);
		}
		const cost = leaves ? await valueOut(ctx, it, serials.length) : it.avgCost;
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
		throw new StockError(
			`Only ${available} ${unit} of ${it.name} ${line.lotId ? 'in that lot ' : ''}can be taken from ${ctx.locationNames.get(locationId)}; the line needs ${quantity} ${unit}.` +
				(options.allowUnusable ? '' : ' Expired, quarantined and recalled lots are not counted.'),
			line.id
		);
	}
	if (held > 0) {
		const usable = allocate(
			rows.map((r) => ({ ...r, quantity: Number(r.quantity) })),
			Number.MAX_SAFE_INTEGER,
			{ today, lotId: line.lotId }
		).takes.reduce((s, t) => s + t.quantity, 0);
		if (usable - held < quantity - 0.00001) throw heldError(usable - held);
	}
	const cost = leaves ? await valueOut(ctx, it, quantity) : it.avgCost;

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
