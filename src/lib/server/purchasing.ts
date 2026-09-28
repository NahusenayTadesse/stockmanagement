/**
 * Purchase orders: what was ordered, what has arrived, what is still due. Deliveries are ordinary
 * goods receipts pointing back at the order; everything here is worked out from them.
 */
import { error } from '@sveltejs/kit';
import { and, asc, desc, eq, inArray, isNull, lte, ne, sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import {
	branch,
	item,
	itemUnit,
	location,
	purchaseOrder,
	purchaseOrderLine,
	stockDocument,
	stockDocumentLine,
	supplier,
	uom
} from '$lib/server/db/schema';
import { qualified } from '$lib/server/db/sql';
import { round4 } from '$lib/server/stock/math';
import { itemOnHand } from '$lib/server/stock/queries';
import { issueNumber, StockError, type Tx } from '$lib/server/stock/post';

type Writer = typeof db | Tx;

export async function orgOrder(orgId: number, id: number, reader: Writer = db) {
	const [row] = await reader
		.select()
		.from(purchaseOrder)
		.where(
			and(eq(purchaseOrder.id, id), eq(purchaseOrder.orgId, orgId), isNull(purchaseOrder.deletedAt))
		);
	if (!row) error(404, 'Purchase order not found');
	return row;
}

/** Quantity delivered against an order line, in the line's own unit, by posted receipts only. */
const receivedOnLine = sql<number>`COALESCE((
	SELECT SUM(${stockDocumentLine.quantity}) FROM ${stockDocumentLine}
	JOIN ${stockDocument} ON ${stockDocument.id} = ${stockDocumentLine.documentId}
	WHERE ${stockDocumentLine.purchaseOrderLineId} = ${qualified(purchaseOrderLine, purchaseOrderLine.id)}
		AND ${stockDocument.status} = 'posted' AND ${stockDocumentLine.deletedAt} IS NULL
), 0)`;

/** An order's lines with ordered, received and still-due quantities. */
export async function orderLines(orgId: number, orderId: number, reader: Writer = db) {
	const rows = await reader
		.select({
			id: purchaseOrderLine.id,
			itemId: purchaseOrderLine.itemId,
			item: item.name,
			sku: item.sku,
			uomId: purchaseOrderLine.uomId,
			unit: uom.symbol,
			quantity: purchaseOrderLine.quantity,
			unitPrice: purchaseOrderLine.unitPrice,
			note: purchaseOrderLine.note,
			received: receivedOnLine,
			trackLots: item.trackLots,
			trackExpiry: item.trackExpiry,
			trackSerials: item.trackSerials
		})
		.from(purchaseOrderLine)
		.innerJoin(item, eq(item.id, purchaseOrderLine.itemId))
		.innerJoin(uom, eq(uom.id, purchaseOrderLine.uomId))
		.where(
			and(
				eq(purchaseOrderLine.orgId, orgId),
				eq(purchaseOrderLine.purchaseOrderId, orderId),
				isNull(purchaseOrderLine.deletedAt)
			)
		)
		.orderBy(asc(purchaseOrderLine.id));

	return rows.map((r) => {
		const received = round4(Number(r.received));
		return {
			...r,
			received,
			due: Math.max(0, round4(r.quantity - received)),
			value: Math.round(r.quantity * (r.unitPrice ?? 0) * 100) / 100
		};
	});
}

/**
 * Brings an order's status in line with what has been delivered. Called in the transaction that
 * posts a receipt against it, so the two never disagree. Orders closed or cancelled by hand stay so.
 */
export async function refreshOrderStatus(tx: Tx, orgId: number, orderId: number) {
	const order = await orgOrder(orgId, orderId, tx);
	if (order.status === 'closed' || order.status === 'cancelled' || order.status === 'draft') return;

	const lines = await orderLines(orgId, orderId, tx);
	const anything = lines.some((l) => l.received > 0);
	const everything = lines.length > 0 && lines.every((l) => l.due === 0);
	const status = everything ? 'received' : anything ? 'partially_received' : 'ordered';

	if (status !== order.status) {
		await tx.update(purchaseOrder).set({ status }).where(eq(purchaseOrder.id, orderId));
	}
}

/** Orders with their totals, for the list. */
export async function orderList(orgId: number) {
	const value = sql<number>`COALESCE((
		SELECT SUM(${purchaseOrderLine.quantity} * COALESCE(${purchaseOrderLine.unitPrice}, 0))
		FROM ${purchaseOrderLine}
		WHERE ${purchaseOrderLine.purchaseOrderId} = ${qualified(purchaseOrder, purchaseOrder.id)}
			AND ${purchaseOrderLine.deletedAt} IS NULL
	), 0)`;
	const lineCount = sql<number>`(
		SELECT COUNT(*) FROM ${purchaseOrderLine}
		WHERE ${purchaseOrderLine.purchaseOrderId} = ${qualified(purchaseOrder, purchaseOrder.id)}
			AND ${purchaseOrderLine.deletedAt} IS NULL
	)`;
	const receipts = sql<number>`(
		SELECT COUNT(*) FROM ${stockDocument}
		WHERE ${stockDocument.purchaseOrderId} = ${qualified(purchaseOrder, purchaseOrder.id)}
			AND ${stockDocument.status} = 'posted'
	)`;

	const rows = await db
		.select({
			id: purchaseOrder.id,
			number: purchaseOrder.number,
			status: purchaseOrder.status,
			orderDate: purchaseOrder.orderDate,
			expectedDate: purchaseOrder.expectedDate,
			supplierId: purchaseOrder.supplierId,
			supplier: supplier.name,
			location: location.name,
			branch: branch.name,
			lines: lineCount,
			value,
			receipts
		})
		.from(purchaseOrder)
		.innerJoin(supplier, eq(supplier.id, purchaseOrder.supplierId))
		.innerJoin(location, eq(location.id, purchaseOrder.locationId))
		.innerJoin(branch, eq(branch.id, purchaseOrder.branchId))
		.where(and(eq(purchaseOrder.orgId, orgId), isNull(purchaseOrder.deletedAt)))
		.orderBy(desc(purchaseOrder.id))
		.limit(1000);

	return rows.map((r) => ({
		...r,
		lines: Number(r.lines),
		value: Math.round(Number(r.value) * 100) / 100,
		receipts: Number(r.receipts)
	}));
}

/**
 * What is on order for each item, in base units: ordered minus delivered on orders still open.
 * The reorder screen subtracts it, so nobody orders the same shortage twice.
 */
export async function onOrderByItem(
	orgId: number,
	reader: Writer = db
): Promise<Map<number, number>> {
	const rows = await reader
		.select({
			itemId: purchaseOrderLine.itemId,
			uomId: purchaseOrderLine.uomId,
			baseUomId: item.baseUomId,
			quantity: purchaseOrderLine.quantity,
			received: receivedOnLine
		})
		.from(purchaseOrderLine)
		.innerJoin(purchaseOrder, eq(purchaseOrder.id, purchaseOrderLine.purchaseOrderId))
		.innerJoin(item, eq(item.id, purchaseOrderLine.itemId))
		.where(
			and(
				eq(purchaseOrderLine.orgId, orgId),
				isNull(purchaseOrderLine.deletedAt),
				inArray(purchaseOrder.status, ['ordered', 'partially_received'])
			)
		);

	const itemIds = [...new Set(rows.map((r) => r.itemId))];
	const factors = itemIds.length
		? await reader
				.select()
				.from(itemUnit)
				.where(and(inArray(itemUnit.itemId, itemIds), isNull(itemUnit.deletedAt)))
		: [];

	const out = new Map<number, number>();
	for (const r of rows) {
		const factor =
			r.uomId === r.baseUomId
				? 1
				: (factors.find((f) => f.itemId === r.itemId && f.uomId === r.uomId)?.factor ?? 1);
		const due = Math.max(0, r.quantity - Number(r.received)) * factor;
		out.set(r.itemId, round4((out.get(r.itemId) ?? 0) + due));
	}
	return out;
}

/** Receipts made against an order, drafts included. */
export async function orderReceipts(orgId: number, orderId: number) {
	return db
		.select({
			id: stockDocument.id,
			number: stockDocument.number,
			status: stockDocument.status,
			docDate: stockDocument.docDate,
			reference: stockDocument.reference
		})
		.from(stockDocument)
		.where(
			and(
				eq(stockDocument.orgId, orgId),
				eq(stockDocument.purchaseOrderId, orderId),
				ne(stockDocument.status, 'cancelled')
			)
		)
		.orderBy(desc(stockDocument.id));
}

/**
 * Sends a draft to the supplier: it gets its number and its lines are fixed from here on — the
 * supplier is working from them.
 */
export async function markOrdered(
	tx: Tx,
	input: { orgId: number; orderId: number; userId?: string }
) {
	const order = await orgOrder(input.orgId, input.orderId, tx);
	if (order.status !== 'draft')
		throw new StockError(`This order is already ${order.status.replace('_', ' ')}.`);
	const lines = await orderLines(input.orgId, order.id, tx);
	if (!lines.length) throw new StockError('Add at least one line before ordering.');

	const number = await issueNumber(tx, {
		orgId: input.orgId,
		branchId: order.branchId,
		sequence: 'po',
		prefix: 'PO',
		date: order.orderDate
	});
	await tx
		.update(purchaseOrder)
		.set({ status: 'ordered', number, orderedAt: new Date(), orderedBy: input.userId ?? null })
		.where(eq(purchaseOrder.id, order.id));
	return number;
}

/**
 * A draft goods receipt for everything still due on an order, at the agreed prices. The storekeeper
 * then corrects the quantities to what actually arrived, adds lots and serials, and posts it.
 */
export async function receiptFromOrder(
	tx: Tx,
	input: { orgId: number; orderId: number; date: string; userId?: string }
): Promise<number> {
	const order = await orgOrder(input.orgId, input.orderId, tx);
	if (order.status !== 'ordered' && order.status !== 'partially_received') {
		throw new StockError(
			order.status === 'draft'
				? 'Mark the order as ordered before receiving against it.'
				: `This order is ${order.status.replace('_', ' ')}.`
		);
	}

	const [pending] = await tx
		.select({ id: stockDocument.id })
		.from(stockDocument)
		.where(and(eq(stockDocument.purchaseOrderId, order.id), eq(stockDocument.status, 'draft')));
	if (pending) {
		throw new StockError(
			`Draft receipt #${pending.id} is already receiving this order; post or cancel it first.`
		);
	}

	const due = (await orderLines(input.orgId, order.id, tx)).filter((l) => l.due > 0);
	if (!due.length) throw new StockError('Everything on this order has arrived.');

	const [loc] = await tx
		.select({ branchId: location.branchId })
		.from(location)
		.where(eq(location.id, order.locationId));
	const [doc] = await tx
		.insert(stockDocument)
		.values({
			orgId: input.orgId,
			type: 'receipt',
			branchId: loc.branchId,
			docDate: input.date,
			toLocationId: order.locationId,
			supplierId: order.supplierId,
			purchaseOrderId: order.id,
			reference: order.number,
			createdBy: input.userId
		})
		.$returningId();

	await tx.insert(stockDocumentLine).values(
		due.map((l) => ({
			orgId: input.orgId,
			documentId: doc.id,
			itemId: l.itemId,
			uomId: l.uomId,
			quantity: l.due,
			unitCost: l.unitPrice,
			purchaseOrderLineId: l.id
		}))
	);
	return doc.id;
}

/** The order as the supplier sees it, for the email and the printout. */
export async function orderForSupplier(orgId: number, orderId: number) {
	const order = await orgOrder(orgId, orderId);
	const [[details], lines] = await Promise.all([
		db
			.select({
				supplier: supplier.name,
				supplierEmail: supplier.email,
				supplierPhone: supplier.phone,
				location: location.name,
				branch: branch.name,
				branchAddress: branch.address,
				branchPhone: branch.phone
			})
			.from(purchaseOrder)
			.innerJoin(supplier, eq(supplier.id, purchaseOrder.supplierId))
			.innerJoin(location, eq(location.id, purchaseOrder.locationId))
			.innerJoin(branch, eq(branch.id, purchaseOrder.branchId))
			.where(eq(purchaseOrder.id, order.id)),
		orderLines(orgId, order.id)
	]);
	return { order, details, lines };
}

/**
 * Items at or below their reorder level, with what is already on order and a suggested quantity:
 * enough to bring stock back up to twice the reorder level. Everything in base units.
 */
export async function reorderSuggestions(orgId: number, reader: Writer = db) {
	const [rows, onOrder] = await Promise.all([
		reader
			.select({
				id: item.id,
				sku: item.sku,
				name: item.name,
				unit: uom.symbol,
				reorderLevel: item.reorderLevel,
				avgCost: item.avgCost,
				supplierId: item.supplierId,
				supplier: supplier.name,
				onHand: itemOnHand
			})
			.from(item)
			.innerJoin(uom, eq(uom.id, item.baseUomId))
			.leftJoin(supplier, eq(supplier.id, item.supplierId))
			.where(
				and(
					eq(item.orgId, orgId),
					isNull(item.deletedAt),
					eq(item.isActive, true),
					eq(item.stockTracked, true),
					eq(item.purchasable, true),
					sql`${item.reorderLevel} IS NOT NULL`,
					lte(itemOnHand, item.reorderLevel)
				)
			)
			.orderBy(asc(supplier.name), asc(item.name)),
		onOrderByItem(orgId, reader)
	]);

	return rows.map((r) => {
		const onHand = round4(Number(r.onHand));
		const ordered = onOrder.get(r.id) ?? 0;
		const level = r.reorderLevel ?? 0;
		return {
			...r,
			onHand,
			onOrder: ordered,
			suggested: Math.max(0, Math.ceil(2 * level - onHand - ordered))
		};
	});
}

/**
 * Draft purchase orders from the reorder screen: one per main supplier, at the item's average
 * cost as a starting price. Returns the new orders' ids.
 */
export async function ordersFromReorder(
	tx: Tx,
	input: {
		orgId: number;
		locationId: number;
		date: string;
		picks: { itemId: number; quantity: number }[];
		userId?: string;
	}
): Promise<number[]> {
	const picks = input.picks.filter((p) => Number.isFinite(p.quantity) && p.quantity > 0);
	if (!picks.length) throw new StockError('Tick at least one item and give it a quantity.');

	const [loc] = await tx
		.select({ id: location.id, branchId: location.branchId })
		.from(location)
		.where(
			and(
				eq(location.id, input.locationId),
				eq(location.orgId, input.orgId),
				isNull(location.deletedAt)
			)
		);
	if (!loc) throw new StockError('Choose where the orders should be delivered.');

	const items = await tx
		.select({
			id: item.id,
			name: item.name,
			supplierId: item.supplierId,
			baseUomId: item.baseUomId,
			avgCost: item.avgCost
		})
		.from(item)
		.where(
			and(
				eq(item.orgId, input.orgId),
				inArray(
					item.id,
					picks.map((p) => p.itemId)
				),
				isNull(item.deletedAt)
			)
		);
	const byId = new Map(items.map((i) => [i.id, i]));

	const bySupplier = new Map<number, { itemId: number; quantity: number }[]>();
	for (const p of picks) {
		const it = byId.get(p.itemId);
		if (!it) throw new StockError('One of the items is no longer available; reload the page.');
		if (!it.supplierId)
			throw new StockError(`${it.name} has no main supplier. Set one on the item first.`);
		bySupplier.set(it.supplierId, [...(bySupplier.get(it.supplierId) ?? []), p]);
	}

	const ids: number[] = [];
	for (const [supplierId, lines] of bySupplier) {
		const [order] = await tx
			.insert(purchaseOrder)
			.values({
				orgId: input.orgId,
				branchId: loc.branchId,
				supplierId,
				locationId: loc.id,
				orderDate: input.date,
				note: null,
				createdBy: input.userId
			})
			.$returningId();
		await tx.insert(purchaseOrderLine).values(
			lines.map((l) => {
				const it = byId.get(l.itemId)!;
				return {
					orgId: input.orgId,
					purchaseOrderId: order.id,
					itemId: it.id,
					uomId: it.baseUomId,
					quantity: round4(l.quantity),
					unitPrice: it.avgCost ? Math.round(it.avgCost * 100) / 100 : null
				};
			})
		);
		ids.push(order.id);
	}
	return ids;
}
