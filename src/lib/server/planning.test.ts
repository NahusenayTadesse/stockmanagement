import { beforeAll, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { configureKit } from '@nahu/admin-kit/server/db';
import { inRollback, type TestTx } from '@nahu/admin-kit/server/testing/rollback';

import { db } from '$lib/server/db';
import {
	item,
	location,
	organization,
	purchaseOrder,
	purchaseOrderLine,
	quote,
	quoteLine,
	reorderRule,
	stockDocument,
	stockDocumentLine,
	supplier,
	uom
} from '$lib/server/db/schema';
import { createOrganization } from '$lib/server/seedPermissions';
import { postDocument } from '$lib/server/stock/post';
import { reserveQuote } from '$lib/server/reservations';
import { markOrdered, reorderSuggestions } from './purchasing';

/** Reorder planning: per-location rules, what is held, what is on order, and usage. */

beforeAll(() => configureKit({ db }));

const TODAY = '2026-09-29';

async function shop(tx: TestTx) {
	const { orgId, branchId } = await createOrganization(tx, { name: 'Planning test shop' });
	const [store] = await tx
		.select()
		.from(location)
		.where(and(eq(location.orgId, orgId), eq(location.kind, 'storage')));
	const [floor] = await tx
		.insert(location)
		.values({ orgId, branchId, name: 'Shop floor', kind: 'sales' })
		.$returningId();
	const [pcs] = await tx
		.select()
		.from(uom)
		.where(and(eq(uom.orgId, orgId), eq(uom.name, 'Piece')));
	const [sup] = await tx
		.insert(supplier)
		.values({ orgId, name: 'Slow supplier', phone: '0911000009', leadTimeDays: 10 })
		.$returningId();
	const newItem = async (name: string, values: Partial<typeof item.$inferInsert> = {}) =>
		(
			await tx
				.insert(item)
				.values({
					orgId,
					sku: `PL-${Math.random()}`.slice(0, 12),
					name,
					baseUomId: pcs.id,
					supplierId: sup.id,
					...values
				})
				.$returningId()
		)[0].id;
	const move = async (
		type: 'receipt' | 'issue',
		itemId: number,
		quantity: number,
		docDate: string,
		at = store.id
	) => {
		const [d] = await tx
			.insert(stockDocument)
			.values({
				orgId,
				type,
				branchId,
				docDate,
				toLocationId: type === 'receipt' ? at : null,
				fromLocationId: type === 'issue' ? at : null,
				supplierId: type === 'receipt' ? sup.id : null
			})
			.$returningId();
		await tx.insert(stockDocumentLine).values({
			orgId,
			documentId: d.id,
			itemId,
			uomId: pcs.id,
			quantity,
			unitCost: type === 'receipt' ? 10 : null
		});
		await postDocument(tx, { orgId, documentId: d.id, today: TODAY });
	};
	return {
		orgId,
		branchId,
		store: store.id,
		floor: floor.id,
		pcs: pcs.id,
		sup: sup.id,
		newItem,
		move
	};
}

describe('reorder planning', () => {
	it('fills a location up to its maximum, less what is held and what is coming there', async () => {
		const r = await inRollback(async (tx) => {
			const s = await shop(tx);
			await tx.update(organization).set({ reserveStock: true }).where(eq(organization.id, s.orgId));
			const cement = await s.newItem('Cement');
			const plenty = await s.newItem('Nails');
			await s.move('receipt', cement, 12, '2026-09-20');
			await s.move('receipt', plenty, 100, '2026-09-20');
			await tx.insert(reorderRule).values([
				{ orgId: s.orgId, itemId: cement, locationId: s.store, minQuantity: 10, maxQuantity: 50 },
				{ orgId: s.orgId, itemId: plenty, locationId: s.store, minQuantity: 10, maxQuantity: 50 }
			]);

			// 5 promised on an accepted proforma: 12 on hand, 7 free — below the minimum of 10.
			const [q] = await tx
				.insert(quote)
				.values({
					orgId: s.orgId,
					branchId: s.branchId,
					quoteDate: TODAY,
					status: 'accepted',
					locationId: s.store
				})
				.$returningId();
			await tx.insert(quoteLine).values({
				orgId: s.orgId,
				quoteId: q.id,
				itemId: cement,
				uomId: s.pcs,
				quantity: 5,
				unitPrice: 20
			});
			await reserveQuote(tx, { orgId: s.orgId, quoteId: q.id });

			// 10 coming to the store, 30 to the shop floor (which does not count here).
			for (const [locationId, quantity] of [
				[s.store, 10],
				[s.floor, 30]
			]) {
				const [po] = await tx
					.insert(purchaseOrder)
					.values({
						orgId: s.orgId,
						branchId: s.branchId,
						supplierId: s.sup,
						locationId,
						orderDate: TODAY
					})
					.$returningId();
				await tx.insert(purchaseOrderLine).values({
					orgId: s.orgId,
					purchaseOrderId: po.id,
					itemId: cement,
					uomId: s.pcs,
					quantity
				});
				await markOrdered(tx, { orgId: s.orgId, orderId: po.id });
			}
			return {
				rows: await reorderSuggestions(s.orgId, tx, { locationId: s.store, today: TODAY }),
				cement
			};
		});
		expect(r.rows.map((x) => x.name)).toEqual(['Cement']);
		expect(r.rows[0]).toMatchObject({
			onHand: 12,
			held: 5,
			onOrder: 10,
			reorderLevel: 10,
			max: 50,
			belowMin: true,
			suggested: 33
		});
	});

	it('flags what will run out before a delivery could arrive, even without a minimum', async () => {
		const r = await inRollback(async (tx) => {
			const s = await shop(tx);
			const paint = await s.newItem('Paint');
			const idle = await s.newItem('Ladder');
			await s.move('receipt', paint, 100, '2026-07-31');
			await s.move('issue', paint, 90, '2026-08-30');
			await s.move('receipt', idle, 5, '2026-07-31');
			return reorderSuggestions(s.orgId, tx, { today: TODAY });
		});
		// 90 used over the 60 days since it first moved: 1.5 a day. 10 left lasts 6 days; the
		// supplier takes 10. Enough for the lead time and a month after: 1.5 × 40 = 60, less 10.
		expect(r.map((x) => x.name)).toEqual(['Paint']);
		expect(r[0]).toMatchObject({
			usagePerDay: 1.5,
			daysLeft: 6,
			leadTimeDays: 10,
			leadTimeAssumed: false,
			belowMin: false,
			runsOut: true,
			suggested: 50
		});
	});
});
