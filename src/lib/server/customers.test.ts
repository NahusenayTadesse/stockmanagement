import { beforeAll, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { configureKit } from '@nahu/admin-kit/server/db';
import { WriteRefused } from '@nahu/admin-kit/server/childCrud';
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
import { postDocument } from '$lib/server/stock/post';
import { checkTransaction } from '$lib/server/transactions';
import { customerList } from './customers';

beforeAll(() => configureKit({ db }));

const TODAY = '2026-09-29';

/** A shop with 100 pieces in stock at 10 birr, and one customer on its list. */
async function shop(tx: TestTx, name = 'Customer test shop') {
	const { orgId, branchId } = await createOrganization(tx, { name });
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
		.values({ orgId, sku: 'CUP', name: 'Cup', baseUomId: pcs.id, supplierId: sup.id })
		.$returningId();

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
		itemId: it.id,
		uomId: pcs.id,
		quantity: 100,
		unitCost: 10
	});
	await postDocument(tx, { orgId, documentId: grn.id, today: TODAY });

	// Only a name: a phone is optional.
	const [buyer] = await tx.insert(customer).values({ orgId, name: 'Almaz' }).$returningId();

	/**
	 * An issue of `qty` cups at 15 birr, to the customer or to nobody in particular. A walk-in sale
	 * could go unpriced; one to a named customer may not.
	 */
	const sell = async (qty: number, customerId: number | null) => {
		const [doc] = await tx
			.insert(stockDocument)
			.values({
				orgId,
				type: 'issue',
				branchId,
				docDate: TODAY,
				fromLocationId: store.id,
				customerId
			})
			.$returningId();
		await tx.insert(stockDocumentLine).values({
			orgId,
			documentId: doc.id,
			itemId: it.id,
			uomId: pcs.id,
			quantity: qty,
			unitPrice: customerId ? 15 : null
		});
		await postDocument(tx, { orgId, documentId: doc.id, today: TODAY });
	};

	return { orgId, branchId, customerId: buyer.id, sell };
}

describe('customers', () => {
	it('adds up what a customer took and paid, and leaves walk-in sales out', async () => {
		const rows = await inRollback(async (tx) => {
			const s = await shop(tx);
			await s.sell(7, s.customerId);
			await s.sell(20, null); // walk-in: nobody named
			const paid = await checkTransaction(
				{
					direction: 'in',
					amount: 120,
					occurredOn: TODAY,
					purpose: 'sale',
					customerId: s.customerId
				},
				s.orgId,
				undefined,
				tx
			);
			await tx.insert(transactions).values({ ...paid, orgId: s.orgId });
			// A voided payment does not count.
			await tx.insert(transactions).values({
				...paid,
				reference: null,
				orgId: s.orgId,
				status: 'void',
				voidReason: 'typed twice'
			});
			return customerList(s.orgId, tx);
		});

		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({ name: 'Almaz', purchases: 1, taken: 70, paid: 120 });
	});

	it("names the payer after the customer, and refuses another business's customer", async () => {
		const result = await inRollback(async (tx) => {
			const mine = await shop(tx, 'Mine');
			const theirs = await shop(tx, 'Theirs');
			const named = await checkTransaction(
				{
					direction: 'in',
					amount: 50,
					occurredOn: TODAY,
					purpose: 'sale',
					customerId: mine.customerId
				},
				mine.orgId,
				undefined,
				tx
			);
			let refused: string | null = null;
			try {
				await checkTransaction(
					{
						direction: 'in',
						amount: 50,
						occurredOn: TODAY,
						purpose: 'sale',
						customerId: theirs.customerId
					},
					mine.orgId,
					undefined,
					tx
				);
			} catch (err) {
				if (!(err instanceof WriteRefused)) throw err;
				refused = err.field ?? null;
			}
			const walkIn = await checkTransaction(
				{ direction: 'in', amount: 50, occurredOn: TODAY, purpose: 'sale' },
				mine.orgId,
				undefined,
				tx
			);
			return { named, refused, walkIn };
		});

		expect(result.named).toMatchObject({ party: 'Almaz', customerId: expect.any(Number) });
		expect(result.refused).toBe('customerId');
		expect(result.walkIn).toMatchObject({ customerId: null, party: null });
	});
});
