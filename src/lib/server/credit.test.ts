import { beforeAll, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { configureKit } from '@nahu/admin-kit/server/db';
import { inRollback, type TestTx } from '@nahu/admin-kit/server/testing/rollback';

import { db } from '$lib/server/db';
import {
	customer,
	item,
	location,
	stockDocument,
	stockDocumentLine,
	supplier,
	transactions,
	uom
} from '$lib/server/db/schema';
import { createOrganization } from '$lib/server/seedPermissions';
import { postDocument, StockError } from '$lib/server/stock/post';
import { creditSummary, customerStatement } from './credit';

beforeAll(() => configureKit({ db }));

/** A shop with plenty of stock, and a customer on the given credit terms. */
async function shop(tx: TestTx, terms: { creditLimit: number | null; creditDays: number }) {
	const { orgId, branchId } = await createOrganization(tx, { name: 'Credit test shop' });
	const [store] = await tx
		.select()
		.from(location)
		.where(and(eq(location.orgId, orgId), eq(location.kind, 'storage')));
	const [pcs] = await tx
		.select()
		.from(uom)
		.where(and(eq(uom.orgId, orgId), eq(uom.name, 'Piece')));
	const [sup] = await tx
		.insert(supplier)
		.values({ orgId, name: 'S', phone: '0911000000' })
		.$returningId();
	const [it] = await tx
		.insert(item)
		.values({ orgId, sku: 'BAG', name: 'Bag', baseUomId: pcs.id, supplierId: sup.id })
		.$returningId();

	const [grn] = await tx
		.insert(stockDocument)
		.values({
			orgId,
			type: 'receipt',
			branchId,
			docDate: '2026-05-01',
			toLocationId: store.id,
			supplierId: sup.id
		})
		.$returningId();
	await tx.insert(stockDocumentLine).values({
		orgId,
		documentId: grn.id,
		itemId: it.id,
		uomId: pcs.id,
		quantity: 1000,
		unitCost: 5
	});
	await postDocument(tx, { orgId, documentId: grn.id, today: '2026-05-01' });

	const [buyer] = await tx
		.insert(customer)
		.values({ orgId, name: 'Kidane', ...terms })
		.$returningId();

	/** A draft sale of `qty` bags at `price` each (null: unpriced). */
	const draft = async (date: string, qty: number, price: number | null) => {
		const [doc] = await tx
			.insert(stockDocument)
			.values({
				orgId,
				type: 'issue',
				branchId,
				docDate: date,
				fromLocationId: store.id,
				customerId: buyer.id
			})
			.$returningId();
		await tx.insert(stockDocumentLine).values({
			orgId,
			documentId: doc.id,
			itemId: it.id,
			uomId: pcs.id,
			quantity: qty,
			unitPrice: price
		});
		return doc.id;
	};
	const sell = async (date: string, qty: number, price: number, allowOverLimit = false) => {
		const id = await draft(date, qty, price);
		await postDocument(tx, { orgId, documentId: id, today: date, allowOverLimit });
		return id;
	};
	const pay = async (date: string, amount: number, documentId?: number) => {
		const [row] = await tx
			.insert(transactions)
			.values({
				orgId,
				direction: 'in',
				amount,
				occurredOn: date,
				purpose: 'sale',
				customerId: buyer.id
			})
			.$returningId();
		if (documentId) {
			await tx
				.update(stockDocument)
				.set({ transactionId: row.id })
				.where(eq(stockDocument.id, documentId));
		}
	};

	return { orgId, customerId: buyer.id, draft, sell, pay };
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

describe('customer credit', () => {
	it('applies payments to the oldest sales first and ages what is left', async () => {
		const { statement, summary } = await inRollback(async (tx) => {
			const s = await shop(tx, { creditLimit: null, creditDays: 30 });
			await s.sell('2026-06-01', 100, 10); // 1000
			await s.sell('2026-08-15', 50, 10); // 500, due 2026-09-14
			await s.pay('2026-09-01', 1200);
			await s.sell('2026-09-20', 30, 10); // 300, due 2026-10-20
			return {
				statement: await customerStatement(s.orgId, s.customerId, { today: '2026-09-29' }, tx),
				summary: await creditSummary(s.orgId, '2026-09-29', tx)
			};
		});

		expect(statement).toMatchObject({ sold: 1800, paid: 1200, balance: 600, overdue: 300 });
		// The June sale is paid off; 300 of August's is left, 15 days late; September's is not due.
		expect(statement.open.map((o) => [o.docDate, o.remaining, o.daysOverdue, o.bucket])).toEqual([
			['2026-08-15', 300, 15, 'd1_30'],
			['2026-09-20', 300, -21, 'current']
		]);
		expect(statement.lines.map((l) => l.balance)).toEqual([1000, 1500, 300, 600]);
		expect(summary[0].buckets).toMatchObject({ current: 300, d1_30: 300, d90_plus: 0 });
	});

	it('refuses an unpriced sale, and one over the limit unless allowed', async () => {
		const result = await inRollback(async (tx) => {
			const s = await shop(tx, { creditLimit: 1000, creditDays: 30 });
			await s.sell('2026-09-01', 80, 10); // owes 800
			const unpriced = await refusal(
				tx.transaction(async (sp) => {
					const id = await s.draft('2026-09-02', 1, null);
					await postDocument(sp, { orgId: s.orgId, documentId: id, today: '2026-09-02' });
				})
			);
			const over = await refusal(
				tx.transaction(() => s.sell('2026-09-03', 30, 10)) // would owe 1100
			);
			// Paying first makes room.
			await s.pay('2026-09-04', 500);
			const afterPaying = await refusal(tx.transaction(() => s.sell('2026-09-05', 30, 10)));
			// Someone allowed to may go over.
			const allowed = await refusal(tx.transaction(() => s.sell('2026-09-06', 200, 10, true)));
			const position = await customerStatement(s.orgId, s.customerId, { today: '2026-09-06' }, tx);
			return { unpriced, over, afterPaying, allowed, position };
		});

		expect(result.unpriced).toMatch(/give every line a sale price/);
		expect(result.over).toMatch(/ETB 1,100\.00 owed, over their credit limit of ETB 1,000\.00/);
		expect(result.afterPaying).toBeNull();
		expect(result.allowed).toBeNull();
		expect(result.position).toMatchObject({ balance: 2600, overLimit: true });
	});

	it('lets a cash-only customer buy once the payment is recorded on the sale', async () => {
		const result = await inRollback(async (tx) => {
			const s = await shop(tx, { creditLimit: 0, creditDays: 0 });
			const id = await s.draft('2026-09-10', 10, 25);
			const unpaid = await refusal(
				tx.transaction((sp) =>
					postDocument(sp, { orgId: s.orgId, documentId: id, today: '2026-09-10' })
				)
			);
			await s.pay('2026-09-10', 250, id);
			const paid = await refusal(
				tx.transaction((sp) =>
					postDocument(sp, { orgId: s.orgId, documentId: id, today: '2026-09-10' })
				)
			);
			return { unpaid, paid };
		});
		expect(result.unpaid).toMatch(/buys for cash only\. Record the payment of ETB 250\.00/);
		expect(result.paid).toBeNull();
	});
});
