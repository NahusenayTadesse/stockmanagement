import { beforeAll, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { configureKit } from '@nahu/admin-kit/server/db';
import { inRollback, type TestTx } from '@nahu/admin-kit/server/testing/rollback';

import { db } from '$lib/server/db';
import {
	item,
	location,
	reorderRule,
	stockDocument,
	stockDocumentLine,
	supplier,
	uom
} from '$lib/server/db/schema';
import { createOrganization } from '$lib/server/seedPermissions';
import { postDocument } from '$lib/server/stock/post';
import {
	abcAnalysis,
	addMonths,
	bucketOf,
	classify,
	locationsFor,
	outPeriods,
	serialLookup,
	slowMoving,
	stockOuts,
	stockTrend,
	warrantyOf
} from './analysis';

beforeAll(() => configureKit({ db }));

const TODAY = '2026-09-29';

describe('the arithmetic', () => {
	it('classes items by where their value starts in the ranking', () => {
		const ranked = classify([
			{ itemId: 1, value: 700 },
			{ itemId: 2, value: 150 },
			{ itemId: 3, value: 100 },
			{ itemId: 4, value: 50 },
			{ itemId: 5, value: 0 }
		]);
		expect(ranked.map((r) => [r.itemId, r.cls, r.cumulative])).toEqual([
			[1, 'A', 70],
			[2, 'A', 85],
			[3, 'B', 95],
			[4, 'C', 100]
		]);
	});

	it('finds the stretches stock sat at zero after having been there', () => {
		expect(
			outPeriods([
				{ day: '2026-01-01', change: 0 },
				{ day: '2026-01-02', change: 5 },
				{ day: '2026-01-05', change: -5 },
				{ day: '2026-01-09', change: 3 },
				{ day: '2026-01-10', change: -3 }
			])
		).toEqual([
			{ from: '2026-01-05', to: '2026-01-09' },
			{ from: '2026-01-10', to: null }
		]);
	});

	it('adds months to a day, and dates a warranty from the sale', () => {
		expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
		expect(addMonths('2025-11-15', 12)).toBe('2026-11-15');
		expect(warrantyOf(null, '2026-01-01', TODAY)).toEqual({ state: 'none' });
		expect(warrantyOf(12, null, TODAY)).toEqual({ state: 'not_sold', months: 12 });
		expect(warrantyOf(12, '2026-01-01', TODAY)).toMatchObject({
			state: 'active',
			until: '2027-01-01'
		});
		expect(warrantyOf(6, '2026-01-01', TODAY)).toMatchObject({
			state: 'expired',
			until: '2026-07-01'
		});
	});

	it('buckets days by week starting Monday', () => {
		expect(bucketOf('2026-09-29', 'week').key).toBe('2026-09-28');
		expect(bucketOf('2026-09-28', 'week').key).toBe('2026-09-28');
		expect(bucketOf('2026-09-27', 'week').key).toBe('2026-09-21');
	});
});

async function shop(tx: TestTx) {
	const { orgId, branchId } = await createOrganization(tx, { name: 'Analysis test' });
	const [store] = await tx
		.select()
		.from(location)
		.where(and(eq(location.orgId, orgId), eq(location.kind, 'storage')));
	const units = await tx.select().from(uom).where(eq(uom.orgId, orgId));
	const pcs = units.find((u) => u.name === 'Piece')!.id;
	const [sup] = await tx
		.insert(supplier)
		.values({ orgId, name: 'S', phone: '0911000000' })
		.$returningId();
	const newItem = async (name: string, values: Partial<typeof item.$inferInsert> = {}) => {
		const [row] = await tx
			.insert(item)
			.values({
				orgId,
				sku: name.toUpperCase(),
				name,
				baseUomId: pcs,
				supplierId: sup.id,
				...values
			})
			.$returningId();
		return row.id;
	};
	const move = async (
		type: 'receipt' | 'issue',
		day: string,
		itemId: number,
		quantity: number,
		extra: Partial<typeof stockDocumentLine.$inferInsert> = {}
	) => {
		const [d] = await tx
			.insert(stockDocument)
			.values({
				orgId,
				type,
				branchId,
				docDate: day,
				fromLocationId: type === 'issue' ? store.id : null,
				toLocationId: type === 'receipt' ? store.id : null,
				supplierId: type === 'receipt' ? sup.id : null
			})
			.$returningId();
		await tx.insert(stockDocumentLine).values({
			orgId,
			documentId: d.id,
			itemId,
			uomId: pcs,
			quantity,
			unitCost: type === 'receipt' ? 10 : null,
			unitPrice: type === 'issue' ? 25 : null,
			...extra
		});
		await postDocument(tx, { orgId, documentId: d.id, today: day });
		return d.id;
	};
	const transfer = async (day: string, itemId: number, quantity: number, toLocationId: number) => {
		const [d] = await tx
			.insert(stockDocument)
			.values({
				orgId,
				type: 'transfer',
				branchId,
				docDate: day,
				fromLocationId: store.id,
				toLocationId
			})
			.$returningId();
		await tx
			.insert(stockDocumentLine)
			.values({ orgId, documentId: d.id, itemId, uomId: pcs, quantity });
		await postDocument(tx, { orgId, documentId: d.id, today: day });
	};
	const locationIds = await locationsFor(orgId, { scope: null, shelvesOnly: true }, tx);
	return { orgId, branchId, store: store.id, newItem, move, transfer, locationIds };
}

describe('reports off the ledger', () => {
	it('finds slow and dead stock, ranks ABC, and dates stock-outs', async () => {
		const r = await inRollback(async (tx) => {
			const s = await shop(tx);
			const busy = await s.newItem('Busy');
			const slow = await s.newItem('Slow');
			const dead = await s.newItem('Dead');
			await s.move('receipt', '2026-01-10', busy, 100);
			await s.move('receipt', '2026-01-10', slow, 10);
			await s.move('receipt', '2026-01-10', dead, 10);
			await s.move('issue', '2026-06-01', slow, 2);
			await s.move('issue', '2026-09-20', busy, 60);
			await s.move('issue', '2026-09-25', busy, 40);
			await s.move('receipt', '2026-09-27', busy, 5);

			const slowDead = await slowMoving(
				s.orgId,
				{ locationIds: s.locationIds, today: TODAY, slowDays: 90, deadDays: 180 },
				tx
			);
			const abc = await abcAnalysis(
				s.orgId,
				{ locationIds: s.locationIds, from: '2026-01-01', to: TODAY, basis: 'cost' },
				tx
			);
			const revenue = await abcAnalysis(
				s.orgId,
				{ locationIds: s.locationIds, from: '2026-01-01', to: TODAY, basis: 'revenue' },
				tx
			);
			const outs = await stockOuts(
				s.orgId,
				{
					locationIds: s.locationIds,
					from: '2026-09-01',
					to: TODAY,
					today: TODAY,
					byLocation: false
				},
				tx
			);
			return { slowDead, abc, revenue, outs, busy, slow, dead };
		});

		expect(r.slowDead.rows.map((x) => [x.item, x.status, x.idleDays])).toEqual([
			['Dead', 'dead', 262],
			['Slow', 'slow', 120]
		]);
		expect(r.slowDead).toMatchObject({ slowValue: 80, deadValue: 100 });

		expect(r.abc.rows.map((x) => [x.item, x.cls, x.value])).toEqual([
			['Busy', 'A', 1000],
			['Slow', 'C', 20],
			['Dead', 'none', 0]
		]);
		expect(r.revenue.total).toBe(2550);

		expect(r.outs.periods.map((p) => [p.item, p.outFrom, p.backIn, p.days])).toEqual([
			['Busy', '2026-09-25', '2026-09-27', 2]
		]);
	});

	it('draws an item’s level over time against its location’s min and max', async () => {
		const r = await inRollback(async (tx) => {
			const s = await shop(tx);
			const cup = await s.newItem('Cup', { reorderLevel: 5 });
			await s.move('receipt', '2026-09-01', cup, 20);
			await s.move('issue', '2026-09-10', cup, 8);
			await s.move('issue', '2026-09-10', cup, 4);
			await s.move('receipt', '2026-09-12', cup, 10);
			// A move to the shop floor: out of the store, but not out of the business.
			const [floor] = await tx
				.insert(location)
				.values({ orgId: s.orgId, branchId: s.branchId, name: 'Floor', kind: 'sales' })
				.$returningId();
			await s.transfer('2026-09-11', cup, 3, floor.id);
			const everywhere = await locationsFor(s.orgId, { scope: null }, tx);
			await tx.insert(reorderRule).values({
				orgId: s.orgId,
				itemId: cup,
				locationId: s.store,
				minQuantity: 6,
				maxQuantity: 30
			});
			const all = await stockTrend(
				s.orgId,
				{
					itemId: cup,
					locationIds: everywhere,
					from: '2026-09-05',
					to: '2026-09-12',
					grain: 'day'
				},
				tx
			);
			const here = await stockTrend(
				s.orgId,
				{
					itemId: cup,
					locationIds: [s.store],
					locationId: s.store,
					from: '2026-09-05',
					to: '2026-09-12',
					grain: 'week'
				},
				tx
			);
			return { all, here };
		});
		expect(r.all!.opening).toBe(20);
		expect(r.all!.buckets.map((b) => b.closing)).toEqual([20, 20, 20, 20, 20, 8, 8, 18]);
		expect(r.all!.low).toBe(8);
		expect(r.all!.totalOut).toBe(12);
		expect(r.all!.lines).toMatchObject({ min: 5, source: 'item' });
		expect(r.here!.buckets.map((b) => [b.key, b.closing])).toEqual([
			['2026-08-31', 20],
			['2026-09-07', 15]
		]);
		expect(r.here!.lines).toMatchObject({ min: 6, max: 30, source: 'location' });
	});

	it('traces a serial from its supplier to its buyer, with its warranty', async () => {
		const found = await inRollback(async (tx) => {
			const s = await shop(tx);
			const phone = await s.newItem('Phone', { trackSerials: true, warrantyMonths: 12 });
			await s.move('receipt', '2026-02-01', phone, 2, { serials: 'IMEI-0001\nIMEI-0002' });
			await s.move('issue', '2026-03-15', phone, 1, { serials: 'IMEI-0002' });
			return serialLookup(s.orgId, { q: 'imei-000', today: TODAY, scope: null }, tx);
		});
		expect(found.map((u) => [u.serialNumber, u.status, u.warranty.state])).toEqual([
			['IMEI-0001', 'in_stock', 'not_sold'],
			['IMEI-0002', 'issued', 'active']
		]);
		expect(found[1].warranty).toMatchObject({ until: '2027-03-15', soldOn: '2026-03-15' });
		expect(found[1].events.map((e) => e.kind)).toEqual(['receipt', 'issue']);
		expect(found[1].events[0].who).toBe('S');
	});
});
