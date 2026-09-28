import { beforeAll, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { configureKit } from '@nahu/admin-kit/server/db';
import { inRollback, type TestTx } from '@nahu/admin-kit/server/testing/rollback';

import { db } from '$lib/server/db';
import {
	item,
	location,
	lot,
	stockBalance,
	stockCountLine,
	stockDocument,
	stockDocumentLine,
	stockMovement,
	supplier,
	uom
} from '$lib/server/db/schema';
import { createOrganization } from '$lib/server/seedPermissions';
import { postDocument, StockError } from '$lib/server/stock/post';
import { addFoundLine, countLines, openCount, postCount, saveCounts } from './counts';

beforeAll(() => configureKit({ db }));

const TODAY = '2026-09-28';

async function stockedShop(tx: TestTx) {
	const { orgId, branchId } = await createOrganization(tx, { name: 'Count test shop' });
	const [store] = await tx
		.select()
		.from(location)
		.where(and(eq(location.orgId, orgId), eq(location.kind, 'storage')));
	const units = await tx.select().from(uom).where(eq(uom.orgId, orgId));
	const pcs = units.find((u) => u.name === 'Piece')!.id;
	const [sup] = await tx
		.insert(supplier)
		.values({ orgId, name: 'S', phone: '0911' + '000000' })
		.$returningId();

	const newItem = async (values: Partial<typeof item.$inferInsert>) =>
		(
			await tx
				.insert(item)
				.values({
					orgId,
					sku: `C-${Math.random()}`.slice(0, 12),
					name: 'x',
					baseUomId: pcs,
					supplierId: sup.id,
					...values
				})
				.$returningId()
		)[0].id;

	const gloves = await newItem({ name: 'Gloves' });
	const syrup = await newItem({ name: 'Syrup', trackLots: true, trackExpiry: true });
	const phone = await newItem({ name: 'Phone', trackSerials: true });

	const [doc] = await tx
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
	await tx.insert(stockDocumentLine).values([
		{ orgId, documentId: doc.id, itemId: gloves, uomId: pcs, quantity: 50, unitCost: 10 },
		{
			orgId,
			documentId: doc.id,
			itemId: syrup,
			uomId: pcs,
			quantity: 20,
			unitCost: 30,
			lotNumber: 'S1',
			expiryDate: '2027-06-01'
		},
		{
			orgId,
			documentId: doc.id,
			itemId: syrup,
			uomId: pcs,
			quantity: 5,
			unitCost: 30,
			lotNumber: 'S2',
			expiryDate: '2027-09-01'
		},
		{
			orgId,
			documentId: doc.id,
			itemId: phone,
			uomId: pcs,
			quantity: 1,
			unitCost: 9000,
			serials: 'P-1'
		}
	]);
	await postDocument(tx, { orgId, documentId: doc.id, today: TODAY });

	return { orgId, store: store.id, gloves, syrup, phone };
}

async function balance(tx: TestTx, itemId: number, locationId: number) {
	const rows = await tx
		.select({ q: stockBalance.quantity })
		.from(stockBalance)
		.where(and(eq(stockBalance.itemId, itemId), eq(stockBalance.locationId, locationId)));
	return rows.reduce((s, r) => s + Number(r.q), 0);
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

describe('stock counts', () => {
	it('snapshots each lot at the location and leaves serial-tracked items out', async () => {
		const lines = await inRollback(async (tx) => {
			const shop = await stockedShop(tx);
			const id = await openCount(tx, {
				orgId: shop.orgId,
				locationId: shop.store,
				categoryId: null,
				blind: true,
				countDate: TODAY,
				note: null
			});
			return countLines(shop.orgId, id, tx);
		});
		expect(lines.map((l) => [l.item, l.lotNumber, l.expected])).toEqual([
			['Gloves', null, 50],
			['Syrup', 'S1', 20],
			['Syrup', 'S2', 5]
		]);
	});

	it('posts the differences as one adjustment, and the shelf then matches the count', async () => {
		const result = await inRollback(async (tx) => {
			const shop = await stockedShop(tx);
			const id = await openCount(tx, {
				orgId: shop.orgId,
				locationId: shop.store,
				categoryId: null,
				blind: true,
				countDate: TODAY,
				note: null
			});
			const lines = await countLines(shop.orgId, id, tx);
			const line = (name: string, lotNumber: string | null) =>
				lines.find((l) => l.item === name && l.lotNumber === lotNumber)!.id;

			// Two gloves missing, one S1 bottle extra, S2 exactly right.
			await saveCounts(tx, shop.orgId, id, [
				{ lineId: line('Gloves', null), counted: 48 },
				{ lineId: line('Syrup', 'S1'), counted: 21 },
				{ lineId: line('Syrup', 'S2'), counted: 5 }
			]);
			const posted = await postCount(tx, { orgId: shop.orgId, countId: id, today: TODAY });

			const moves = await tx
				.select({
					itemId: stockMovement.itemId,
					quantity: stockMovement.quantity,
					kind: stockMovement.kind
				})
				.from(stockMovement)
				.where(eq(stockMovement.documentId, posted.adjustmentId!))
				.orderBy(stockMovement.id);
			return {
				posted,
				moves,
				gloves: await balance(tx, shop.gloves, shop.store),
				syrup: await balance(tx, shop.syrup, shop.store),
				shop
			};
		});

		expect(result.posted.lines).toBe(2);
		expect(result.posted.number).toMatch(/-ADJ-/);
		expect(result.moves).toEqual([
			{ itemId: result.shop.gloves, quantity: -2, kind: 'adjustment_out' },
			{ itemId: result.shop.syrup, quantity: 1, kind: 'adjustment_in' }
		]);
		expect(result).toMatchObject({ gloves: 48, syrup: 26 });
	});

	it('will not post until every line is counted, and a clean count posts nothing', async () => {
		const result = await inRollback(async (tx) => {
			const shop = await stockedShop(tx);
			const id = await openCount(tx, {
				orgId: shop.orgId,
				locationId: shop.store,
				categoryId: null,
				blind: true,
				countDate: TODAY,
				note: null
			});
			const lines = await countLines(shop.orgId, id, tx);
			const early = await refusal(
				tx.transaction((sp) => postCount(sp, { orgId: shop.orgId, countId: id }))
			);
			await saveCounts(
				tx,
				shop.orgId,
				id,
				lines.map((l) => ({ lineId: l.id, counted: l.expected }))
			);
			const clean = await postCount(tx, { orgId: shop.orgId, countId: id, today: TODAY });
			return { early, clean };
		});
		expect(result.early).toMatch(/3 lines have not been counted/);
		expect(result.clean).toEqual({ adjustmentId: null, number: null, lines: 0 });
	});

	it('records stock found that was not expected, and refuses a second open count', async () => {
		const result = await inRollback(async (tx) => {
			const shop = await stockedShop(tx);
			const id = await openCount(tx, {
				orgId: shop.orgId,
				locationId: shop.store,
				categoryId: null,
				blind: true,
				countDate: TODAY,
				note: null
			});
			const second = await refusal(
				tx.transaction((sp) =>
					openCount(sp, {
						orgId: shop.orgId,
						locationId: shop.store,
						categoryId: null,
						blind: false,
						countDate: TODAY,
						note: null
					})
				)
			);
			const [s1] = await tx
				.select()
				.from(lot)
				.where(and(eq(lot.itemId, shop.syrup), eq(lot.lotNumber, 'S1')));
			const duplicate = await refusal(
				tx.transaction((sp) =>
					addFoundLine(sp, {
						orgId: shop.orgId,
						countId: id,
						itemId: shop.syrup,
						lotId: s1.id,
						counted: 3
					})
				)
			);
			const serial = await refusal(
				tx.transaction((sp) =>
					addFoundLine(sp, {
						orgId: shop.orgId,
						countId: id,
						itemId: shop.phone,
						lotId: null,
						counted: 1
					})
				)
			);
			const found = await tx
				.select()
				.from(stockCountLine)
				.where(eq(stockCountLine.addedDuringCount, true));
			return { second, duplicate, serial, found: found.length };
		});
		expect(result.second).toMatch(/still open/);
		expect(result.duplicate).toMatch(/already on this count/);
		expect(result.serial).toMatch(/counted by serial number/);
		expect(result.found).toBe(0);
	});
});
