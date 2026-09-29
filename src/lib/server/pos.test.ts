import { beforeAll, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { configureKit } from '@nahu/admin-kit/server/db';
import { inRollback, type TestTx } from '@nahu/admin-kit/server/testing/rollback';

import { db } from '$lib/server/db';
import {
	customer,
	item,
	itemUnit,
	location,
	organization,
	paymentMethod,
	priceList,
	priceListItem,
	quote,
	quoteLine,
	roles,
	stockDocument,
	stockDocumentLine,
	supplier,
	transactions,
	uom,
	user
} from '$lib/server/db/schema';
import { createOrganization } from '$lib/server/seedPermissions';
import { postDocument, StockError } from '$lib/server/stock/post';
import { customerStatement } from './credit';
import { priceTable } from './pricing';
import { checkout, closeShift, openShift, shiftSummary } from './pos';
import { convertQuote } from './quotes';

beforeAll(() => configureKit({ db }));

const TODAY = '2026-09-29';

/** A VAT-registered shop with 100 cups on the shelf (list price 100, boxes of 10), and a till. */
async function shop(tx: TestTx) {
	const { orgId, branchId } = await createOrganization(tx, { name: 'POS test shop' });
	await tx
		.update(organization)
		.set({ vatRegistered: true, maxDiscountPercent: 10 })
		.where(eq(organization.id, orgId));
	const [store] = await tx
		.select()
		.from(location)
		.where(and(eq(location.orgId, orgId), eq(location.kind, 'storage')));
	const units = await tx.select().from(uom).where(eq(uom.orgId, orgId));
	const pcs = units.find((u) => u.name === 'Piece')!.id;
	const box = units.find((u) => u.name === 'Box')!.id;
	const [sup] = await tx
		.insert(supplier)
		.values({ orgId, name: 'S', phone: '0911000000' })
		.$returningId();
	const [{ id: cup }] = await tx
		.insert(item)
		.values({ orgId, sku: 'CUP', name: 'Cup', baseUomId: pcs, supplierId: sup.id, salePrice: 100 })
		.$returningId();
	await tx.insert(itemUnit).values({ orgId, itemId: cup, uomId: box, factor: 10 });

	const [grn] = await tx
		.insert(stockDocument)
		.values({
			orgId,
			type: 'receipt',
			branchId,
			docDate: TODAY,
			toLocationId: store.id,
			supplierId: sup.id
		})
		.$returningId();
	await tx.insert(stockDocumentLine).values({
		orgId,
		documentId: grn.id,
		itemId: cup,
		uomId: pcs,
		quantity: 100,
		unitCost: 40
	});
	await postDocument(tx, { orgId, documentId: grn.id, today: TODAY });

	const methods = await tx.select().from(paymentMethod).where(eq(paymentMethod.orgId, orgId));
	const cash = methods.find((m) => m.kind === 'cash')!.id;
	const telebirr = methods.find((m) => m.name === 'Telebirr')!.id;

	const [role] = await tx.select().from(roles).where(eq(roles.orgId, orgId)).limit(1);
	const userId = `pos-test-${Math.random().toString(36).slice(2)}`;
	await tx.insert(user).values({
		id: userId,
		name: 'Cashier',
		email: `${userId}@example.com`,
		emailVerified: true,
		orgId,
		roleId: role.id
	});
	const shiftId = await openShift(tx, { orgId, userId, locationId: store.id, openingFloat: 500 });

	const [buyer] = await tx
		.insert(customer)
		.values({ orgId, name: 'Selam', creditLimit: 1000 })
		.$returningId();

	const sell = (over: Partial<Parameters<typeof checkout>[1]>) =>
		checkout(tx, {
			orgId,
			userId,
			shiftId,
			customerId: null,
			lines: [{ itemId: cup, uomId: pcs, quantity: 2, unitPrice: 100 }],
			payments: [],
			today: TODAY,
			allowOverLimit: false,
			allowDiscount: false,
			maxDiscountPercent: 10,
			...over
		});

	return {
		orgId,
		branchId,
		store: store.id,
		pcs,
		box,
		cup,
		cash,
		telebirr,
		userId,
		shiftId,
		buyer: buyer.id,
		sell
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

describe('selling', () => {
	it('prices by the customer price list, per unit, falling back to list price', async () => {
		const r = await inRollback(async (tx) => {
			const s = await shop(tx);
			const [list] = await tx
				.insert(priceList)
				.values({ orgId: s.orgId, name: 'Wholesale' })
				.$returningId();
			const none = await priceTable(s.orgId, [s.cup], null, tx);
			await tx
				.insert(priceListItem)
				.values({ orgId: s.orgId, priceListId: list.id, itemId: s.cup, price: 90 });
			const baseOnly = await priceTable(s.orgId, [s.cup], list.id, tx);
			await tx
				.insert(priceListItem)
				.values({ orgId: s.orgId, priceListId: list.id, itemId: s.cup, uomId: s.box, price: 850 });
			const withBox = await priceTable(s.orgId, [s.cup], list.id, tx);
			return { s, none, baseOnly, withBox };
		});
		const key = (u: number) => `${r.s.cup}:${u}`;
		expect([r.none.get(key(r.s.pcs)), r.none.get(key(r.s.box))]).toEqual([100, 1000]);
		expect([r.baseOnly.get(key(r.s.pcs)), r.baseOnly.get(key(r.s.box))]).toEqual([90, 900]);
		expect(r.withBox.get(key(r.s.box))).toBe(850);
	});

	it('takes split payments, gives change from cash, and the drawer count follows', async () => {
		const r = await inRollback(async (tx) => {
			const s = await shop(tx);
			// 2 × 100 + 15% VAT = 230. Paid 200 cash + 50 Telebirr: 20 change, from the cash.
			const sale = await s.sell({
				payments: [
					{ methodId: s.cash, amount: 200 },
					{ methodId: s.telebirr, amount: 50, reference: 'TB-123' }
				]
			});
			const payments = await tx
				.select({ amount: transactions.amount, methodId: transactions.paymentMethodId })
				.from(transactions)
				.where(eq(transactions.documentId, sale.documentId));
			const summary = await shiftSummary(s.orgId, s.shiftId, tx);
			const again = await refusal(
				tx.transaction(() =>
					s.sell({ payments: [{ methodId: s.telebirr, amount: 230, reference: 'tb-123' }] })
				)
			);
			const closed = await closeShift(tx, {
				orgId: s.orgId,
				shiftId: s.shiftId,
				userId: s.userId,
				countedCash: 675
			});
			return { s, sale, payments, summary, again, closed };
		});

		expect(r.sale).toMatchObject({ total: 230, paid: 230, change: 20, onCredit: 0 });
		expect(r.sale.number).toMatch(/-ISS-/);
		expect(r.payments).toEqual(
			expect.arrayContaining([
				{ amount: 180, methodId: r.s.cash },
				{ amount: 50, methodId: r.s.telebirr }
			])
		);
		// Float 500 + 180 cash.
		expect(r.summary).toMatchObject({ sales: 1, taken: 230, expectedCash: 680 });
		expect(r.again).toMatch(/already recorded/);
		expect(r.closed).toMatchObject({ expectedCash: 680, countedCash: 675 });
	});

	it('puts an unpaid remainder on a named customer, never on a walk-in', async () => {
		const r = await inRollback(async (tx) => {
			const s = await shop(tx);
			const walkIn = await refusal(
				tx.transaction(() => s.sell({ payments: [{ methodId: s.cash, amount: 100 }] }))
			);
			const sale = await s.sell({
				customerId: s.buyer,
				payments: [{ methodId: s.cash, amount: 100 }]
			});
			// 1000 limit: 130 owed now; another 1150 would go over.
			const over = await refusal(
				tx.transaction(() =>
					s.sell({
						customerId: s.buyer,
						lines: [{ itemId: s.cup, uomId: s.pcs, quantity: 10, unitPrice: 100 }]
					})
				)
			);
			const position = await customerStatement(s.orgId, s.buyer, { today: TODAY }, tx);
			return { walkIn, sale, over, position };
		});
		expect(r.walkIn).toMatch(/Collect 130\.00 more/);
		expect(r.sale).toMatchObject({ total: 230, paid: 100, onCredit: 130 });
		expect(r.over).toMatch(/over their credit limit/);
		expect(r.position.balance).toBe(130);
	});

	it('holds discounts to the limit unless allowed, and keeps the list price', async () => {
		const r = await inRollback(async (tx) => {
			const s = await shop(tx);
			const tooMuch = await refusal(
				tx.transaction(() =>
					s.sell({
						lines: [{ itemId: s.cup, uomId: s.pcs, quantity: 1, unitPrice: 80 }],
						payments: [{ methodId: s.cash, amount: 92 }]
					})
				)
			);
			const allowed = await s.sell({
				allowDiscount: true,
				lines: [{ itemId: s.cup, uomId: s.pcs, quantity: 1, unitPrice: 80 }],
				payments: [{ methodId: s.cash, amount: 92 }]
			});
			const [line] = await tx
				.select({ unitPrice: stockDocumentLine.unitPrice, listPrice: stockDocumentLine.listPrice })
				.from(stockDocumentLine)
				.where(eq(stockDocumentLine.documentId, allowed.documentId));
			return { tooMuch, line };
		});
		expect(r.tooMuch).toMatch(/20% off Cup is more than the 10%/);
		expect(r.line).toEqual({ unitPrice: 80, listPrice: 100 });
	});

	it('turns a proforma into a draft sale at the quoted prices', async () => {
		const r = await inRollback(async (tx) => {
			const s = await shop(tx);
			const [q] = await tx
				.insert(quote)
				.values({
					orgId: s.orgId,
					branchId: s.branchId,
					quoteDate: TODAY,
					buyerName: 'Kirkos sub-city office',
					buyerTin: '0000099999',
					locationId: s.store
				})
				.$returningId();
			await tx.insert(quoteLine).values({
				orgId: s.orgId,
				quoteId: q.id,
				itemId: s.cup,
				uomId: s.box,
				quantity: 2,
				unitPrice: 950,
				listPrice: 1000
			});
			const docId = await convertQuote(tx, { orgId: s.orgId, quoteId: q.id, date: TODAY });
			const [doc] = await tx.select().from(stockDocument).where(eq(stockDocument.id, docId));
			const lines = await tx
				.select()
				.from(stockDocumentLine)
				.where(eq(stockDocumentLine.documentId, docId));
			const [after] = await tx.select().from(quote).where(eq(quote.id, q.id));
			const twice = await refusal(
				tx.transaction((sp) => convertQuote(sp, { orgId: s.orgId, quoteId: q.id, date: TODAY }))
			);
			return { doc, lines, after, twice };
		});
		expect(r.doc).toMatchObject({
			type: 'issue',
			status: 'draft',
			party: 'Kirkos sub-city office'
		});
		expect(r.doc.reference).toMatch(/-PRF-/);
		expect(r.lines[0]).toMatchObject({ quantity: 2, unitPrice: 950, listPrice: 1000 });
		expect(r.after).toMatchObject({ status: 'converted', saleId: r.doc.id });
		expect(r.twice).toMatch(/already become a sale/);
	});
});
