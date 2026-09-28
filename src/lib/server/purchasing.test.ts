import { beforeAll, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { configureKit } from '@nahu/admin-kit/server/db';
import { inRollback, type TestTx } from '@nahu/admin-kit/server/testing/rollback';

import { db } from '$lib/server/db';
import {
	item,
	itemUnit,
	location,
	purchaseOrder,
	purchaseOrderLine,
	stockBalance,
	stockDocument,
	stockDocumentLine,
	supplier,
	uom
} from '$lib/server/db/schema';
import { createOrganization } from '$lib/server/seedPermissions';
import { postDocument, StockError } from '$lib/server/stock/post';
import {
	markOrdered,
	onOrderByItem,
	orderLines,
	orgOrder,
	ordersFromReorder,
	receiptFromOrder,
	reorderSuggestions
} from './purchasing';
import { draftFollowUp, expiryWatch } from './expiry';

beforeAll(() => configureKit({ db }));

const TODAY = '2026-09-28';

async function shop(tx: TestTx) {
	const { orgId, branchId } = await createOrganization(tx, { name: 'Purchasing test shop' });
	const [store] = await tx
		.select()
		.from(location)
		.where(and(eq(location.orgId, orgId), eq(location.kind, 'storage')));
	const units = await tx.select().from(uom).where(eq(uom.orgId, orgId));
	const pcs = units.find((u) => u.name === 'Piece')!.id;
	const box = units.find((u) => u.name === 'Box')!.id;
	const [a] = await tx
		.insert(supplier)
		.values({ orgId, name: 'Alpha', phone: '0911000001' })
		.$returningId();
	const [b] = await tx
		.insert(supplier)
		.values({ orgId, name: 'Beta', phone: '0911000002' })
		.$returningId();

	const newItem = async (values: Partial<typeof item.$inferInsert>) =>
		(
			await tx
				.insert(item)
				.values({
					orgId,
					sku: `P-${Math.random()}`.slice(0, 12),
					name: 'x',
					baseUomId: pcs,
					supplierId: a.id,
					...values
				})
				.$returningId()
		)[0].id;

	// Gloves come in boxes of 100.
	const gloves = await newItem({ name: 'Gloves', reorderLevel: 200 });
	await tx.insert(itemUnit).values({ orgId, itemId: gloves, uomId: box, factor: 100 });
	const masks = await newItem({ name: 'Masks', reorderLevel: 50, supplierId: b.id, avgCost: 12 });

	const [order] = await tx
		.insert(purchaseOrder)
		.values({
			orgId,
			branchId,
			supplierId: a.id,
			locationId: store.id,
			orderDate: TODAY
		})
		.$returningId();
	await tx.insert(purchaseOrderLine).values({
		orgId,
		purchaseOrderId: order.id,
		itemId: gloves,
		uomId: box,
		quantity: 5,
		unitPrice: 900
	});

	return {
		orgId,
		branchId,
		store: store.id,
		pcs,
		box,
		gloves,
		masks,
		alpha: a.id,
		beta: b.id,
		order: order.id
	};
}

async function refusal(promise: Promise<unknown>) {
	try {
		await promise;
		return null;
	} catch (err) {
		if (err instanceof StockError) return err.message;
		throw err;
	}
}

/** Sets the draft receipt's line to what actually arrived, then posts it. */
async function deliver(tx: TestTx, orgId: number, documentId: number, boxes: number) {
	await tx
		.update(stockDocumentLine)
		.set({ quantity: boxes })
		.where(eq(stockDocumentLine.documentId, documentId));
	await postDocument(tx, { orgId, documentId, today: TODAY });
}

describe('purchase orders', () => {
	it('follows deliveries from ordered to partly received to received', async () => {
		const result = await inRollback(async (tx) => {
			const s = await shop(tx);
			const number = await markOrdered(tx, { orgId: s.orgId, orderId: s.order });

			const first = await receiptFromOrder(tx, { orgId: s.orgId, orderId: s.order, date: TODAY });
			const [draft] = await tx
				.select()
				.from(stockDocumentLine)
				.where(eq(stockDocumentLine.documentId, first));
			const whileDrafted = await onOrderByItem(s.orgId, tx);
			await deliver(tx, s.orgId, first, 2);
			const afterFirst = (await orgOrder(s.orgId, s.order, tx)).status;
			const due = (await orderLines(s.orgId, s.order, tx))[0].due;
			const stillOnOrder = await onOrderByItem(s.orgId, tx);

			const second = await receiptFromOrder(tx, { orgId: s.orgId, orderId: s.order, date: TODAY });
			await deliver(tx, s.orgId, second, 3);
			const afterSecond = (await orgOrder(s.orgId, s.order, tx)).status;
			const [bal] = await tx
				.select({ q: stockBalance.quantity })
				.from(stockBalance)
				.where(eq(stockBalance.itemId, s.gloves));
			const [doc] = await tx.select().from(stockDocument).where(eq(stockDocument.id, first));

			return {
				number,
				draft,
				doc,
				whileDrafted: whileDrafted.get(s.gloves),
				afterFirst,
				due,
				stillOnOrder: stillOnOrder.get(s.gloves),
				afterSecond,
				onHand: bal.q,
				s
			};
		});

		expect(result.number).toMatch(/-PO-\d{4}-00001$/);
		// The draft receipt carries the order: its supplier, its line, its unit, its price.
		expect(result.doc).toMatchObject({
			supplierId: result.s.alpha,
			purchaseOrderId: result.s.order,
			reference: result.number
		});
		expect(result.draft).toMatchObject({ uomId: result.s.box, quantity: 5, unitCost: 900 });
		// A draft receipt delivers nothing yet: all 500 pieces still on order.
		expect(result.whileDrafted).toBe(500);
		expect(result.afterFirst).toBe('partially_received');
		expect(result.due).toBe(3);
		expect(result.stillOnOrder).toBe(300);
		expect(result.afterSecond).toBe('received');
		expect(result.onHand).toBe(500);
	});

	it('refuses to receive a draft order, an empty one, or one already being received', async () => {
		const result = await inRollback(async (tx) => {
			const s = await shop(tx);
			const notPlaced = await refusal(
				tx.transaction((sp) =>
					receiptFromOrder(sp, { orgId: s.orgId, orderId: s.order, date: TODAY })
				)
			);

			const [empty] = await tx
				.insert(purchaseOrder)
				.values({
					orgId: s.orgId,
					branchId: s.branchId,
					supplierId: s.alpha,
					locationId: s.store,
					orderDate: TODAY
				})
				.$returningId();
			const nothing = await refusal(
				tx.transaction((sp) => markOrdered(sp, { orgId: s.orgId, orderId: empty.id }))
			);

			await markOrdered(tx, { orgId: s.orgId, orderId: s.order });
			await receiptFromOrder(tx, { orgId: s.orgId, orderId: s.order, date: TODAY });
			const twice = await refusal(
				tx.transaction((sp) =>
					receiptFromOrder(sp, { orgId: s.orgId, orderId: s.order, date: TODAY })
				)
			);
			return { notPlaced, nothing, twice };
		});
		expect(result.notPlaced).toMatch(/Mark the order as ordered/);
		expect(result.nothing).toMatch(/at least one line/);
		expect(result.twice).toMatch(/already receiving this order/);
	});

	it('suggests reorders net of what is on order, and drafts one order per supplier', async () => {
		const result = await inRollback(async (tx) => {
			const s = await shop(tx);
			await markOrdered(tx, { orgId: s.orgId, orderId: s.order });
			const suggestions = await reorderSuggestions(s.orgId, tx);
			const ids = await ordersFromReorder(tx, {
				orgId: s.orgId,
				locationId: s.store,
				date: TODAY,
				picks: [
					{ itemId: s.masks, quantity: 100 },
					{ itemId: s.gloves, quantity: 0 }
				]
			});
			const orders = await tx
				.select()
				.from(purchaseOrderLine)
				.innerJoin(purchaseOrder, eq(purchaseOrder.id, purchaseOrderLine.purchaseOrderId))
				.where(eq(purchaseOrder.id, ids[0]));
			return { suggestions, ids, orders, s };
		});

		const bySku = new Map(result.suggestions.map((r) => [r.name, r]));
		// Gloves: level 200, none on hand, 500 on order → nothing to add.
		expect(bySku.get('Gloves')).toMatchObject({ onHand: 0, onOrder: 500, suggested: 0 });
		// Masks: level 50, nothing anywhere → back up to 100.
		expect(bySku.get('Masks')).toMatchObject({ onHand: 0, onOrder: 0, suggested: 100 });
		// A zero quantity is dropped; the masks go to their own supplier, at average cost.
		expect(result.ids).toHaveLength(1);
		expect(result.orders[0].purchase_order).toMatchObject({
			supplierId: result.s.beta,
			status: 'draft'
		});
		expect(result.orders[0].purchase_order_line).toMatchObject({ quantity: 100, unitPrice: 12 });
	});
});

describe('expiry follow-up', () => {
	it('lists expired stock and drafts a quarantine transfer and a write-off that post', async () => {
		const result = await inRollback(async (tx) => {
			const s = await shop(tx);
			const [quarantine] = await tx
				.select({ id: location.id })
				.from(location)
				.where(and(eq(location.orgId, s.orgId), eq(location.kind, 'quarantine')));
			const [syrup] = await tx
				.insert(item)
				.values({
					orgId: s.orgId,
					sku: 'SYR',
					name: 'Syrup',
					baseUomId: s.pcs,
					supplierId: s.alpha,
					trackLots: true,
					trackExpiry: true
				})
				.$returningId();

			// Received while still good; by TODAY one lot has expired and one expires in 10 days.
			const [doc] = await tx
				.insert(stockDocument)
				.values({
					orgId: s.orgId,
					type: 'receipt',
					branchId: s.branchId,
					docDate: '2026-06-01',
					toLocationId: s.store,
					supplierId: s.alpha
				})
				.$returningId();
			await tx.insert(stockDocumentLine).values([
				{
					orgId: s.orgId,
					documentId: doc.id,
					itemId: syrup.id,
					uomId: s.pcs,
					quantity: 12,
					unitCost: 50,
					lotNumber: 'OLD',
					expiryDate: '2026-09-01'
				},
				{
					orgId: s.orgId,
					documentId: doc.id,
					itemId: syrup.id,
					uomId: s.pcs,
					quantity: 8,
					unitCost: 50,
					lotNumber: 'SOON',
					expiryDate: '2026-10-08'
				}
			]);
			await postDocument(tx, { orgId: s.orgId, documentId: doc.id, today: '2026-06-01' });

			const watch = await expiryWatch(s.orgId, TODAY, tx);
			const old = watch.find((r) => r.lotNumber === 'OLD')!;
			const soon = watch.find((r) => r.lotNumber === 'SOON')!;

			const [moved] = await draftFollowUp(tx, {
				orgId: s.orgId,
				action: 'quarantine',
				picks: [{ lotId: old.lotId, locationId: s.store }],
				date: TODAY
			});
			await postDocument(tx, { orgId: s.orgId, documentId: moved, today: TODAY });
			const [written] = await draftFollowUp(tx, {
				orgId: s.orgId,
				action: 'writeoff',
				picks: [{ lotId: old.lotId, locationId: quarantine.id }],
				date: TODAY
			});
			const [writeoff] = await tx.select().from(stockDocument).where(eq(stockDocument.id, written));
			await postDocument(tx, { orgId: s.orgId, documentId: written, today: TODAY });

			const after = await expiryWatch(s.orgId, TODAY, tx);
			return { old, soon, writeoff, quarantine: quarantine.id, after };
		});

		expect(result.old).toMatchObject({ band: 'expired', quantity: 12, value: 600, days: -27 });
		expect(result.soon).toMatchObject({ band: 'soon', quantity: 8, days: 10 });
		expect(result.writeoff).toMatchObject({
			type: 'adjustment',
			reason: 'expiry',
			fromLocationId: result.quarantine
		});
		// The expired lot is gone; the one still in date remains on the list.
		expect(result.after.map((r) => r.lotNumber)).toEqual(['SOON']);
	});
});
