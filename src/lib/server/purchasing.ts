import { scopeWhere, type Scope } from '$lib/server/scope';
/**
 * Purchase orders: what was ordered, what has arrived, what is still due. Deliveries are ordinary
 * goods receipts pointing back at the order; everything here is worked out from them.
 */

import { and, asc, desc, eq, inArray, isNull, ne, sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import {
	branch,
	item,
	location,
	organization,
	purchaseOrder,
	purchaseOrderLine,
	reorderRule,
	stockBalance,
	stockDocument,
	stockDocumentLine,
	stockMovement,
	supplier,
	uom
} from '$lib/server/db/schema';
import { addLocalDays, localToday } from '@nahu/admin-kit/time';
import { reservedByLocation } from '$lib/server/reservations';
import { qualified } from '$lib/server/db/sql';

import { ApprovalRequired, issueNumber, StockError, type Tx } from '$lib/server/stock/post';
import { m } from '$lib/paraglide/messages.js';
import { PO_STATUS_LABELS } from '$lib/schemas/purchasing';
import { cents, round4 } from '$lib/money';
import { factorIn, packsOf } from '$lib/server/units';
import { daysBetween } from '$lib/server/days';
import { orgRowOr404 } from '$lib/server/org';

type Writer = typeof db | Tx;

export async function orgOrder(orgId: number, id: number, reader: Writer = db) {
	return orgRowOr404(purchaseOrder, orgId, id, m.purchasing_po_not_found, reader);
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
			value: cents(r.quantity * (r.unitPrice ?? 0))
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
		value: cents(Number(r.value)),
		receipts: Number(r.receipts)
	}));
}

/**
 * What is on order for each item, in base units: ordered minus delivered on orders still open.
 * The reorder screen subtracts it, so nobody orders the same shortage twice.
 */
export async function onOrderByItem(
	orgId: number,
	reader: Writer = db,
	/** Only orders to be delivered here. */
	locationId: number | null = null,
	scope: Scope = null
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
				scopeWhere(scope, purchaseOrder.branchId),
				inArray(purchaseOrder.status, ['ordered', 'partially_received']),
				locationId ? eq(purchaseOrder.locationId, locationId) : undefined
			)
		);

	const itemIds = [...new Set(rows.map((r) => r.itemId))];
	const factors = await packsOf(reader, itemIds);

	const out = new Map<number, number>();
	for (const r of rows) {
		const factor = factorIn(factors, { id: r.itemId, baseUomId: r.baseUomId }, r.uomId) ?? 1;
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
	input: {
		orgId: number;
		orderId: number;
		userId?: string;
		/** A second person approved it (maker-checker). */
		approved?: boolean;
	}
) {
	const order = await orgOrder(input.orgId, input.orderId, tx);
	if (order.status !== 'draft')
		throw new StockError(
			m.purchasing_po_already({ status: PO_STATUS_LABELS[order.status].toLowerCase() })
		);
	const lines = await orderLines(input.orgId, order.id, tx);
	if (!lines.length) throw new StockError(m.purchasing_po_add_line_first());

	// Maker-checker: a large order waits for a second person before it goes out.
	if (!input.approved) {
		const [org] = await tx
			.select({ limit: organization.approveOrdersOver })
			.from(organization)
			.where(eq(organization.id, input.orgId));
		const value = cents(lines.reduce((s, l) => s + l.value, 0));
		if (org?.limit != null && value >= org.limit) {
			throw new ApprovalRequired(
				'purchase_order',
				value,
				m.purchasing_po_approval_reason({
					value: value.toFixed(2),
					limit: org.limit.toFixed(2)
				})
			);
		}
	}

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
				? m.purchasing_po_mark_ordered_first()
				: m.purchasing_po_is({ status: PO_STATUS_LABELS[order.status].toLowerCase() })
		);
	}

	const [pending] = await tx
		.select({ id: stockDocument.id })
		.from(stockDocument)
		.where(and(eq(stockDocument.purchaseOrderId, order.id), eq(stockDocument.status, 'draft')));
	if (pending) {
		throw new StockError(m.purchasing_po_receipt_pending({ id: pending.id }));
	}

	const due = (await orderLines(input.orgId, order.id, tx)).filter((l) => l.due > 0);
	if (!due.length) throw new StockError(m.purchasing_po_all_arrived());

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

/** Assumed when a supplier has no lead time: a week from order to delivery. */
export const DEFAULT_LEAD_DAYS = 7;
/** An order should last this long after it arrives, until the next one. */
export const COVER_DAYS = 30;

/**
 * What to reorder, in base units: for one location (by its reorder rules) or for the whole
 * business (by each item's reorder level). An item is listed when
 *
 *   - what is free (on hand, less what is held for proformas and requisitions) is at or below its
 *     minimum, or
 *   - at the rate it has been used over the last `days` days, it will run out before a delivery
 *     ordered today could arrive (the supplier's lead time) — whether or not it has a minimum.
 *
 * The suggestion fills up to the maximum (twice the minimum when there is none), or — when that is
 * less — to what the lead time plus a month of use needs, less what is free and on order.
 * Usage is what left the business: issues, write-offs, losses in transit, net of customer returns.
 */
export async function reorderSuggestions(
	orgId: number,
	reader: Writer = db,
	options: { locationId?: number | null; today?: string; days?: number; scope?: Scope } = {}
) {
	const scope = options.scope ?? null;
	if (scope?.length === 0) return [];
	const permittedLocations = await reader.select({ id: location.id }).from(location).where(and(eq(location.orgId, orgId), scopeWhere(scope, location.branchId)));
	const allowed = new Set(permittedLocations.map((l) => l.id));
	if (options.locationId && !allowed.has(options.locationId)) throw new StockError(m.admin_scope_not_found());
	const locationId = options.locationId ?? null;
	const today = options.today ?? localToday();
	const days = options.days ?? 90;
	const since = addLocalDays(today, -days);

	const used = sql<number>`COALESCE(SUM(CASE
		WHEN ${stockMovement.docDate} >= ${since}
			AND ${stockMovement.kind} IN ('issue', 'adjustment_out', 'transit_loss', 'sales_return')
		THEN -${stockMovement.quantity} ELSE 0 END), 0)`;

	const [items, balances, usage, rules, onOrder, held] = await Promise.all([
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
				leadTimeDays: supplier.leadTimeDays
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
					eq(item.purchasable, true)
				)
			)
			.orderBy(asc(supplier.name), asc(item.name)),
		reader
			.select({
				itemId: stockBalance.itemId,
				quantity: sql<number>`SUM(${stockBalance.quantity})`
			})
			.from(stockBalance)
			.innerJoin(location, eq(location.id, stockBalance.locationId))
			.where(
				and(
					eq(stockBalance.orgId, orgId),
					scopeWhere(scope, location.branchId),
					locationId ? eq(stockBalance.locationId, locationId) : undefined
				)
			)
			.groupBy(stockBalance.itemId),
		reader
			.select({
				itemId: stockMovement.itemId,
				used,
				first: sql<string>`MIN(${stockMovement.docDate})`
			})
			.from(stockMovement)
			.innerJoin(location, eq(location.id, stockMovement.locationId))
			.where(
				and(
					eq(stockMovement.orgId, orgId),
					scopeWhere(scope, location.branchId),
					locationId ? eq(stockMovement.locationId, locationId) : undefined
				)
			)
			.groupBy(stockMovement.itemId),
		locationId
			? reader
					.select()
					.from(reorderRule)
					.where(and(eq(reorderRule.orgId, orgId), eq(reorderRule.locationId, locationId)))
			: Promise.resolve([]),
		onOrderByItem(orgId, reader, locationId, scope),
		reservedByLocation(orgId, today, reader)
	]);

	const heldOf = (itemId: number) => {
		let sum = 0;
		for (const [key, q] of held) {
			const [loc, it] = key.split(':').map(Number);
			if (allowed.has(loc) && it === itemId && (!locationId || loc === locationId)) sum += q;
		}
		return round4(sum);
	};

	const out = [];
	for (const it of items) {
		const rule = rules.find((r) => r.itemId === it.id);
		const min = locationId ? (rule?.minQuantity ?? null) : it.reorderLevel;
		const max = locationId ? (rule?.maxQuantity ?? null) : null;
		const onHand = round4(Number(balances.find((b) => b.itemId === it.id)?.quantity ?? 0));
		const ordered = onOrder.get(it.id) ?? 0;
		const heldHere = heldOf(it.id);
		const free = round4(onHand - heldHere);

		// Usage per day, over the window — or since the item first moved here, if that is sooner
		// (but never less than two weeks, so one early sale does not look like a trend).
		const u = usage.find((x) => x.itemId === it.id);
		const known = u?.first ? daysBetween(u.first, today) : 0;
		const window = Math.min(days, Math.max(14, known));
		const perDay = u ? Math.max(0, Number(u.used)) / window : 0;
		const usagePerDay = Math.round(perDay * 1000) / 1000;

		const lead = it.leadTimeDays ?? DEFAULT_LEAD_DAYS;
		const daysLeft = perDay > 0 ? Math.max(0, Math.floor(free / perDay)) : null;
		const belowMin = min !== null && free <= min;
		// What will be free when an order placed today arrives, counting what is already coming.
		const runsOut = perDay > 0 && free + ordered - perDay * lead < 0;
		if (!belowMin && !runsOut) continue;

		const byLevel = max ?? (min !== null ? 2 * min : 0);
		const byUse = perDay > 0 ? perDay * (lead + COVER_DAYS) : 0;
		const target = max !== null ? max : Math.max(byLevel, byUse);
		out.push({
			...it,
			reorderLevel: min,
			max,
			onHand,
			held: heldHere,
			onOrder: ordered,
			usagePerDay,
			daysLeft,
			leadTimeDays: lead,
			leadTimeAssumed: it.leadTimeDays === null,
			belowMin,
			runsOut,
			suggested: Math.max(0, Math.ceil(round4(target - free - ordered)))
		});
	}
	return out;
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
	if (!picks.length) throw new StockError(m.purchasing_reorder_tick_one());

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
	if (!loc) throw new StockError(m.purchasing_reorder_choose_delivery());

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
		if (!it) throw new StockError(m.purchasing_reorder_item_gone());
		if (!it.supplierId) throw new StockError(m.purchasing_item_no_supplier({ item: it.name }));
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
					unitPrice: it.avgCost ? cents(it.avgCost) : null
				};
			})
		);
		ids.push(order.id);
	}
	return ids;
}
