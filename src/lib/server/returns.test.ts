import { beforeAll, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { configureKit } from '@nahu/admin-kit/server/db';
import { inRollback, type TestTx } from '@nahu/admin-kit/server/testing/rollback';

import { db } from '$lib/server/db';
import {
	customer,
	item,
	location,
	lot,
	organization,
	stockBalance,
	stockDocument,
	stockDocumentLine,
	supplier,
	transactions,
	uom
} from '$lib/server/db/schema';
import { createOrganization } from '$lib/server/seedPermissions';
import { postDocument, StockError } from '$lib/server/stock/post';
import { createReturn } from './returns';
import { customerStatement } from './credit';
import { supplierList } from './suppliers';
import { suggestedWithholding } from './tax';

beforeAll(() => configureKit({ db }));

const TODAY = '2026-09-29';

/** A VAT-registered withholding agent, a VAT-registered supplier with a TIN, and a customer. */
async function shop(tx: TestTx) {
	const { orgId, branchId } = await createOrganization(tx, { name: 'Returns test shop' });
	await tx
		.update(organization)
		.set({ vatRegistered: true, withholdingAgent: true })
		.where(eq(organization.id, orgId));
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
		.values({ orgId, name: 'S', phone: '0911000000', tin: '0012345678', vatRegistered: true })
		.$returningId();
	const [plain] = await tx
		.insert(supplier)
		.values({ orgId, name: 'No TIN', phone: '0911000001' })
		.$returningId();
	const newItem = async (values: Partial<typeof item.$inferInsert>) =>
		(
			await tx
				.insert(item)
				.values({
					orgId,
					sku: `R-${Math.random()}`.slice(0, 12),
					name: 'x',
					baseUomId: pcs.id,
					supplierId: sup.id,
					...values
				})
				.$returningId()
		)[0].id;
	const cable = await newItem({ name: 'Cable' });
	const drug = await newItem({ name: 'Syrup', taxCode: 'exempt', trackLots: true });
	const [buyer] = await tx.insert(customer).values({ orgId, name: 'Hirut' }).$returningId();

	const doc = async (
		values: Partial<typeof stockDocument.$inferInsert> & { type: 'receipt' | 'issue' },
		lines: Partial<typeof stockDocumentLine.$inferInsert>[]
	) => {
		const [d] = await tx
			.insert(stockDocument)
			.values({ orgId, branchId, docDate: TODAY, ...values })
			.$returningId();
		for (const l of lines) {
			await tx.insert(stockDocumentLine).values({
				orgId,
				documentId: d.id,
				itemId: cable,
				uomId: pcs.id,
				quantity: 1,
				...l
			});
		}
		await postDocument(tx, { orgId, documentId: d.id, today: TODAY });
		return d.id;
	};

	const onHand = async (itemId: number) => {
		const rows = await tx
			.select({ q: stockBalance.quantity })
			.from(stockBalance)
			.where(and(eq(stockBalance.itemId, itemId), eq(stockBalance.locationId, store.id)));
		return rows.reduce((s, r) => s + Number(r.q), 0);
	};

	/** Sets the return draft's only line to `qty` and posts it. */
	const returnAndPost = async (originalId: number, qty: number) => {
		const id = await createReturn(tx, { orgId, documentId: originalId, date: TODAY });
		await tx
			.update(stockDocumentLine)
			.set({ quantity: qty })
			.where(eq(stockDocumentLine.documentId, id));
		await postDocument(tx, { orgId, documentId: id, today: TODAY });
		return id;
	};

	return {
		orgId,
		store: store.id,
		supplierId: sup.id,
		plainSupplier: plain.id,
		customerId: buyer.id,
		cable,
		drug,
		doc,
		onHand,
		returnAndPost
	};
}

async function refusal(promise: Promise<unknown>) {
	try {
		await promise;
		return null;
	} catch (err) {
		if (err instanceof StockError || (err instanceof Error && err.name === 'Error')) {
			return (err as Error).message;
		}
		throw err;
	}
}

describe('VAT, returns and withholding', () => {
	it('fixes VAT on posting, credits a customer return, and never returns more than was sold', async () => {
		const r = await inRollback(async (tx) => {
			const s = await shop(tx);
			await s.doc({ type: 'receipt', toLocationId: s.store, supplierId: s.supplierId }, [
				{ quantity: 50, unitCost: 60 },
				{ itemId: s.drug, quantity: 10, unitCost: 20, lotNumber: 'SY-1' }
			]);
			const sale = await s.doc(
				{ type: 'issue', fromLocationId: s.store, customerId: s.customerId },
				[
					{ quantity: 10, unitPrice: 100 },
					{ itemId: s.drug, quantity: 2, unitPrice: 40 }
				]
			);
			const rates = await tx
				.select({ itemId: stockDocumentLine.itemId, vatRate: stockDocumentLine.vatRate })
				.from(stockDocumentLine)
				.where(eq(stockDocumentLine.documentId, sale));
			const beforeReturn = await customerStatement(s.orgId, s.customerId, { today: TODAY }, tx);

			// Four cables come back; the syrup line is dropped from the return.
			const ret = await createReturn(tx, { orgId: s.orgId, documentId: sale, date: TODAY });
			const retLines = await tx
				.select()
				.from(stockDocumentLine)
				.where(eq(stockDocumentLine.documentId, ret));
			for (const l of retLines) {
				if (l.itemId === s.cable) {
					await tx
						.update(stockDocumentLine)
						.set({ quantity: 4 })
						.where(eq(stockDocumentLine.id, l.id));
				} else {
					await tx
						.update(stockDocumentLine)
						.set({ deletedAt: new Date() })
						.where(eq(stockDocumentLine.id, l.id));
				}
			}
			await postDocument(tx, { orgId: s.orgId, documentId: ret, today: TODAY });

			const afterReturn = await customerStatement(s.orgId, s.customerId, { today: TODAY }, tx);
			const cables = await s.onHand(s.cable);

			// Six cables are left to return; seven is one too many.
			const tooMany = await refusal(
				tx.transaction(async (sp) => {
					const id = await createReturn(sp, { orgId: s.orgId, documentId: sale, date: TODAY });
					await sp
						.update(stockDocumentLine)
						.set({ quantity: 7 })
						.where(
							and(eq(stockDocumentLine.documentId, id), eq(stockDocumentLine.itemId, s.cable))
						);
					await postDocument(sp, { orgId: s.orgId, documentId: id, today: TODAY });
				})
			);
			return { s, rates, beforeReturn, afterReturn, cables, tooMany, retLines };
		});

		// Cable is standard-rated at 15%; the syrup is exempt.
		expect(r.rates.find((x) => x.itemId === r.s.cable)?.vatRate).toBe(15);
		expect(r.rates.find((x) => x.itemId === r.s.drug)?.vatRate).toBe(0);
		// 1000 + 150 VAT + 80 exempt.
		expect(r.beforeReturn.balance).toBe(1230);
		// The return copied price and VAT: 4 × 100 + 15%.
		expect(r.retLines.find((l) => l.itemId === r.s.cable)).toMatchObject({
			quantity: 10,
			unitPrice: 100,
			vatRate: 15
		});
		expect(r.afterReturn).toMatchObject({ returned: 460, balance: 770 });
		expect(r.cables).toBe(44);
		expect(r.tooMany).toMatch(/Only 6 can still be returned/);
	});

	it('returns a quarantined lot to the supplier and takes it off what is owed', async () => {
		const r = await inRollback(async (tx) => {
			const s = await shop(tx);
			await s.doc({ type: 'receipt', toLocationId: s.store, supplierId: s.supplierId }, [
				{ itemId: s.drug, quantity: 20, unitCost: 50, lotNumber: 'BAD-1' }
			]);
			const [receipt] = await tx
				.select({ id: stockDocument.id })
				.from(stockDocument)
				.where(and(eq(stockDocument.orgId, s.orgId), eq(stockDocument.type, 'receipt')));
			await tx.update(lot).set({ status: 'quarantine' }).where(eq(lot.lotNumber, 'BAD-1'));

			const owedBefore = (await supplierList(s.orgId, tx)).find((x) => x.id === s.supplierId)!;
			await s.returnAndPost(receipt.id, 5);
			const owedAfter = (await supplierList(s.orgId, tx)).find((x) => x.id === s.supplierId)!;
			return { owedBefore, owedAfter, left: await s.onHand(s.drug) };
		});

		// Exempt syrup: no VAT. 20 × 50 delivered, 5 × 50 sent back.
		expect(r.owedBefore.owed).toBe(1000);
		expect(r.owedAfter.owed).toBe(750);
		expect(r.left).toBe(15);
	});

	it('suggests withholding by threshold and TIN, and counts it as paid', async () => {
		const r = await inRollback(async (tx) => {
			const s = await shop(tx);
			const withTin = await suggestedWithholding(
				s.orgId,
				{ type: 'receipt', supplierId: s.supplierId, customerId: null },
				20_000,
				tx
			);
			const noTin = await suggestedWithholding(
				s.orgId,
				{ type: 'receipt', supplierId: s.plainSupplier, customerId: null },
				20_000,
				tx
			);
			const small = await suggestedWithholding(
				s.orgId,
				{ type: 'receipt', supplierId: s.supplierId, customerId: null },
				9_999,
				tx
			);

			// A customer who withholds: 11,500 owed, pays 11,200 cash and 300 withheld.
			await tx.update(customer).set({ withholdsTax: true }).where(eq(customer.id, s.customerId));
			await s.doc({ type: 'receipt', toLocationId: s.store, supplierId: s.supplierId }, [
				{ quantity: 100, unitCost: 60 }
			]);
			const sale = await s.doc(
				{ type: 'issue', fromLocationId: s.store, customerId: s.customerId },
				[{ quantity: 100, unitPrice: 100 }]
			);
			const fromCustomer = await suggestedWithholding(
				s.orgId,
				{ type: 'issue', supplierId: null, customerId: s.customerId },
				10_000,
				tx
			);
			await tx.insert(transactions).values({
				orgId: s.orgId,
				direction: 'in',
				amount: 11_200,
				withheld: 300,
				withholdingReceipt: 'WH-001',
				occurredOn: TODAY,
				purpose: 'sale',
				customerId: s.customerId
			});
			const position = await customerStatement(s.orgId, s.customerId, { today: TODAY }, tx);
			return { withTin, noTin, small, fromCustomer, position, sale };
		});

		expect(r.withTin).toEqual({ amount: 600, rate: 3 });
		expect(r.noTin).toEqual({ amount: 6000, rate: 30 });
		expect(r.small).toEqual({ amount: 0, rate: 0 });
		expect(r.fromCustomer).toEqual({ amount: 300, rate: 3 });
		expect(r.position).toMatchObject({ sold: 11_500, paid: 11_500, withheld: 300, balance: 0 });
		expect(r.position.lines.map((l) => l.kind)).toEqual(['sale', 'payment', 'withholding']);
	});
});
