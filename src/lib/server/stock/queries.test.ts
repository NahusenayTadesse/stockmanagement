import { beforeAll, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { configureKit } from '@nahu/admin-kit/server/db';
import { inRollback, type TestTx } from '@nahu/admin-kit/server/testing/rollback';
import { addLocalDays, localToday } from '@nahu/admin-kit/time';
import { db } from '$lib/server/db';
import {
	branch,
	category,
	item,
	location,
	lot,
	stockBalance,
	stockDocument,
	uom
} from '$lib/server/db/schema';
import { createOrganization } from '$lib/server/seedPermissions';
import { dashboardStats } from './queries';

beforeAll(() => configureKit({ db }));

async function shop(tx: TestTx) {
	const { orgId, branchId } = await createOrganization(tx, { name: 'Dashboard regression' });
	const [store] = await tx
		.select()
		.from(location)
		.where(and(eq(location.orgId, orgId), eq(location.kind, 'storage')));
	const [unit] = await tx.select().from(uom).where(eq(uom.orgId, orgId)).limit(1);
	const newItem = async (name: string, extra: Partial<typeof item.$inferInsert> = {}) => {
		const [row] = await tx
			.insert(item)
			.values({ orgId, name, sku: name, baseUomId: unit.id, avgCost: 2, ...extra })
			.$returningId();
		return row.id;
	};
	// These are read-query fixtures. No posting, notifications or external providers are invoked.
	const balance = async (
		itemId: number,
		quantity: number,
		locationId = store.id,
		lotId: number | null = null
	) => {
		await tx
			.insert(stockBalance)
			.values({ orgId, itemId, locationId, quantity, lotId, lotKey: lotId ?? 0 });
	};
	const newLot = async (itemId: number, lotNumber: string, expiryDate: string | null) => {
		const [row] = await tx
			.insert(lot)
			.values({ orgId, itemId, lotNumber, expiryDate })
			.$returningId();
		return row.id;
	};
	return { orgId, branchId, storeId: store.id, unitId: unit.id, newItem, balance, newLot };
}

describe('dashboard stock summaries', () => {
	it('scopes balances and lots, includes incoming transfers, and excludes other tenants and deleted documents', async () => {
		await inRollback(async (tx) => {
			const a = await shop(tx);
			const b = await shop(tx);
			const [otherBranch] = await tx
				.insert(branch)
				.values({ orgId: a.orgId, name: 'Other branch', code: 'OTHER' })
				.$returningId();
			const [otherStore] = await tx
				.insert(location)
				.values({ orgId: a.orgId, branchId: otherBranch.id, name: 'Other store', kind: 'storage' })
				.$returningId();
			const id = await a.newItem('Shared item', { reorderLevel: 5 });
			const batch = await a.newLot(id, 'shared-lot', addLocalDays(localToday(), -1));
			await a.balance(id, 2, a.storeId, batch);
			await a.balance(id, 100, otherStore.id, batch);
			const hiddenItem = await a.newItem('Other branch item');
			const hiddenLot = await a.newLot(hiddenItem, 'hidden-lot', addLocalDays(localToday(), 1));
			await a.balance(hiddenItem, 8, otherStore.id, hiddenLot);
			const foreignItem = await b.newItem('Foreign item', { reorderLevel: 99 });
			const foreignLot = await b.newLot(foreignItem, 'foreign-lot', addLocalDays(localToday(), -1));
			await b.balance(foreignItem, 20, b.storeId, foreignLot);
			await tx
				.insert(stockDocument)
				.values({ orgId: b.orgId, branchId: b.branchId, type: 'receipt', docDate: localToday() });
			const documents = await tx
				.insert(stockDocument)
				.values([
					{
						orgId: a.orgId,
						branchId: a.branchId,
						type: 'receipt',
						docDate: localToday(),
						toLocationId: a.storeId
					},
					{
						orgId: a.orgId,
						branchId: otherBranch.id,
						type: 'receipt',
						docDate: localToday(),
						toLocationId: otherStore.id
					},
					{
						orgId: a.orgId,
						branchId: otherBranch.id,
						type: 'transfer',
						docDate: localToday(),
						fromLocationId: otherStore.id,
						toLocationId: a.storeId
					},
					{
						orgId: a.orgId,
						branchId: a.branchId,
						type: 'receipt',
						docDate: localToday(),
						deletedAt: new Date()
					}
				])
				.$returningId();
			const restricted = await dashboardStats(a.orgId, [a.branchId], tx);
			expect(restricted).toMatchObject({
				stockValue: 4,
				itemCount: 2,
				draftCount: 2,
				expiredCount: 1,
				expiringSoonCount: 0,
				expiredValue: 4,
				lowStockCount: 1
			});
			expect(restricted.expiring.map((r) => [r.lotId, Number(r.onHand)])).toEqual([[batch, 2]]);
			expect(restricted.lowStock.map((r) => [r.id, Number(r.onHand)])).toEqual([[id, 2]]);
			expect(restricted.recent.map((r) => r.id)).toEqual([documents[2].id, documents[0].id]);
			const owner = await dashboardStats(a.orgId, null, tx);
			expect(owner).toMatchObject({
				stockValue: 220,
				itemCount: 2,
				draftCount: 3,
				expiredCount: 1,
				expiringSoonCount: 1,
				expiredValue: 204,
				lowStockCount: 0
			});
			expect(owner.recent.map((r) => r.id)).toEqual([
				documents[2].id,
				documents[1].id,
				documents[0].id
			]);
		});
	});

	it('counts every matching lot and low-stock item even when previews are capped at 50', async () => {
		await inRollback(async (tx) => {
			const s = await shop(tx);
			const stocked = await s.newItem('Lots');
			const lots = await tx
				.insert(lot)
				.values(
					Array.from({ length: 58 }, (_, i) => ({
						orgId: s.orgId,
						itemId: stocked,
						lotNumber: `lot-${i}`,
						expiryDate: addLocalDays(localToday(), i < 55 ? -1 : 1)
					}))
				)
				.$returningId();
			await tx.insert(stockBalance).values(
				lots.map((l) => ({
					orgId: s.orgId,
					itemId: stocked,
					locationId: s.storeId,
					lotId: l.id,
					lotKey: l.id,
					quantity: 1
				}))
			);
			await tx.insert(item).values(
				Array.from({ length: 56 }, (_, i) => ({
					orgId: s.orgId,
					baseUomId: s.unitId,
					name: `Low ${i}`,
					sku: `low-${i}`,
					reorderLevel: 5
				}))
			);
			const result = await dashboardStats(s.orgId, null, tx);
			expect(result).toMatchObject({
				expiredCount: 55,
				expiringSoonCount: 3,
				expiredValue: 110,
				lowStockCount: 56
			});
			expect(result.expiring).toHaveLength(50);
			expect(result.lowStock).toHaveLength(50);
		});
	});

	it('respects warning windows, counts shared lots once, and excludes empty and undated lots', async () => {
		await inRollback(async (tx) => {
			const s = await shop(tx);
			const [cat] = await tx
				.insert(category)
				.values({ orgId: s.orgId, name: 'Short window', expiryWarningDays: 2 })
				.$returningId();
			const id = await s.newItem('Short-lived', { categoryId: cat.id });
			const [shelf] = await tx
				.insert(location)
				.values({ orgId: s.orgId, branchId: s.branchId, name: 'Second shelf', kind: 'sales' })
				.$returningId();
			for (const [i, offset] of [-1, 0, 2, 3, null].entries()) {
				const batch = await s.newLot(
					id,
					`boundary-${i}`,
					offset === null ? null : addLocalDays(localToday(), offset)
				);
				await s.balance(id, 1, s.storeId, batch);
				if (offset === -1) await s.balance(id, 2, shelf.id, batch);
			}
			const empty = await s.newLot(id, 'empty', addLocalDays(localToday(), -1));
			await s.balance(id, 0, s.storeId, empty);
			const result = await dashboardStats(s.orgId, [s.branchId], tx);
			expect(result).toMatchObject({ expiredCount: 1, expiringSoonCount: 2, expiredValue: 6 });
			expect(result.expiring).toHaveLength(3);
			expect(result.expiring.map((r) => r.expired)).toEqual([true, false, false]);
		});
	});

	it('returns zero stock metrics for an empty scope while retaining the shared catalog count', async () => {
		await inRollback(async (tx) => {
			const s = await shop(tx);
			const id = await s.newItem('Visible catalog item', { reorderLevel: 10 });
			const batch = await s.newLot(id, 'batch', addLocalDays(localToday(), -1));
			await s.balance(id, 1, s.storeId, batch);
			await tx
				.insert(stockDocument)
				.values({ orgId: s.orgId, branchId: s.branchId, type: 'receipt', docDate: localToday() });
			const result = await dashboardStats(s.orgId, [], tx);
			expect(result).toMatchObject({
				stockValue: 0,
				itemCount: 1,
				draftCount: 0,
				expiredCount: 0,
				expiringSoonCount: 0,
				expiredValue: 0,
				lowStockCount: 0,
				expiring: [],
				lowStock: [],
				recent: []
			});
			const emptyBusiness = await shop(tx);
			expect(await dashboardStats(emptyBusiness.orgId, null, tx)).toMatchObject({
				stockValue: 0,
				itemCount: 0,
				draftCount: 0,
				expiredCount: 0,
				expiringSoonCount: 0,
				expiredValue: 0,
				lowStockCount: 0
			});
		});
	});
});
