import { beforeAll, describe, expect, it } from 'vitest';
import { configureKit } from '@nahu/admin-kit/server/db';
import { inRollback } from '@nahu/admin-kit/server/testing/rollback';
import { eq } from 'drizzle-orm';

import { db } from '$lib/server/db';
import {
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
import { supplierList } from './suppliers';

beforeAll(() => configureKit({ db }));

describe('supplierList', () => {
	/**
	 * The totals are correlated subqueries. Written with an unqualified outer column they compared
	 * each row with itself and every supplier showed zero received and zero paid; this is what
	 * caught it.
	 */
	it('adds up what each supplier delivered and was paid, and what is owed', async () => {
		const rows = await inRollback(async (tx) => {
			const { orgId, branchId } = await createOrganization(tx, { name: 'Supplier totals test' });
			const [store] = await tx.select().from(location).where(eq(location.orgId, orgId));
			const [pcs] = await tx.select().from(uom).where(eq(uom.orgId, orgId));
			const [a] = await tx
				.insert(supplier)
				.values({ orgId, name: 'A', phone: '0911 000 001' })
				.$returningId();
			const [b] = await tx
				.insert(supplier)
				.values({ orgId, name: 'B', phone: '0911 000 002' })
				.$returningId();
			const [it] = await tx
				.insert(item)
				.values({ orgId, sku: 'T-1', name: 'Thing', baseUomId: pcs.id, supplierId: a.id })
				.$returningId();

			const receive = async (supplierId: number, quantity: number, unitCost: number) => {
				const [doc] = await tx
					.insert(stockDocument)
					.values({
						orgId,
						type: 'receipt',
						branchId,
						docDate: '2026-09-28',
						toLocationId: store.id,
						supplierId
					})
					.$returningId();
				await tx
					.insert(stockDocumentLine)
					.values({ orgId, documentId: doc.id, itemId: it.id, uomId: pcs.id, quantity, unitCost });
				await postDocument(tx, { orgId, documentId: doc.id, today: '2026-09-28' });
			};
			await receive(a.id, 10, 100); // 1,000 from A
			await receive(a.id, 5, 40); //     200 more from A
			await receive(b.id, 2, 250); //    500 from B

			const pay = (supplierId: number, amount: number, status: 'recorded' | 'void' = 'recorded') =>
				tx.insert(transactions).values({
					orgId,
					direction: 'out',
					amount,
					occurredOn: '2026-09-28',
					supplierId,
					status
				});
			await pay(a.id, 700);
			await pay(a.id, 5000, 'void'); // voided: must not count
			await pay(b.id, 500);

			return supplierList(orgId, tx);
		});

		const byName = Object.fromEntries(rows.map((r) => [r.name, r]));
		expect(byName.A).toMatchObject({
			items: 1,
			deliveries: 2,
			received: 1200,
			paid: 700,
			owed: 500
		});
		expect(byName.B).toMatchObject({ items: 0, deliveries: 1, received: 500, paid: 500, owed: 0 });
	});
});
