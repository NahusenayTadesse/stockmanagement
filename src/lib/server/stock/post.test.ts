import { beforeAll, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { configureKit } from '@nahu/admin-kit/server/db';
import { inRollback, type TestTx } from '@nahu/admin-kit/server/testing/rollback';

import { db } from '$lib/server/db';
import {
	item,
	itemUnit,
	location,
	lot,
	serialUnit,
	stockBalance,
	stockDocument,
	stockDocumentLine,
	stockMovement,
	supplier,
	uom
} from '$lib/server/db/schema';
import { createOrganization } from '$lib/server/seedPermissions';
import { postDocument, StockError } from './post';

/**
 * The posting rules, against the real database: every test builds a fresh business inside a
 * transaction that is rolled back at the end, so nothing is left behind.
 */

beforeAll(() => configureKit({ db }));

const TODAY = '2026-09-28';

async function business(tx: TestTx) {
	const { orgId, branchId } = await createOrganization(tx, { name: 'Test Pharmacy' });
	const locs = await tx.select().from(location).where(eq(location.orgId, orgId));
	const store = locs.find((l) => l.kind === 'storage')!.id;
	const quarantine = locs.find((l) => l.kind === 'quarantine')!.id;
	const [shop] = await tx
		.insert(location)
		.values({ orgId, branchId, name: 'Shop floor', kind: 'sales' })
		.$returningId();
	const units = await tx.select().from(uom).where(eq(uom.orgId, orgId));
	const unit = (name: string) => units.find((u) => u.name === name)!.id;
	const [main] = await tx
		.insert(supplier)
		.values({ orgId, name: 'Main Pharma Supplier', phone: '+251 911 000 001' })
		.$returningId();
	const [other] = await tx
		.insert(supplier)
		.values({ orgId, name: 'Other Pharma Supplier', phone: '+251 911 000 002' })
		.$returningId();
	return {
		orgId,
		branchId,
		store,
		quarantine,
		shop: shop.id,
		unit,
		supplier: main.id,
		other: other.id
	};
}

type Biz = Awaited<ReturnType<typeof business>>;

async function newItem(tx: TestTx, biz: Biz, values: Partial<typeof item.$inferInsert> = {}) {
	const [row] = await tx
		.insert(item)
		.values({
			orgId: biz.orgId,
			sku: `SKU-${Math.random().toString(36).slice(2, 8)}`,
			name: 'Amoxicillin 500mg',
			baseUomId: biz.unit('Tablet'),
			supplierId: biz.supplier,
			...values
		})
		.$returningId();
	return row.id;
}

async function draft(
	tx: TestTx,
	biz: Biz,
	type: 'receipt' | 'issue' | 'transfer' | 'adjustment',
	locations: { from?: number; to?: number; supplierId?: number | null },
	lines: Partial<typeof stockDocumentLine.$inferInsert>[]
) {
	const [doc] = await tx
		.insert(stockDocument)
		.values({
			orgId: biz.orgId,
			type,
			branchId: biz.branchId,
			docDate: TODAY,
			fromLocationId: locations.from ?? null,
			toLocationId: locations.to ?? null,
			// Receipts come from the business's main test supplier unless a test says otherwise.
			supplierId:
				locations.supplierId !== undefined
					? locations.supplierId
					: type === 'receipt'
						? biz.supplier
						: null
		})
		.$returningId();
	for (const line of lines) {
		await tx.insert(stockDocumentLine).values({
			orgId: biz.orgId,
			documentId: doc.id,
			itemId: line.itemId!,
			uomId: line.uomId ?? biz.unit('Tablet'),
			quantity: line.quantity!,
			...line
		});
	}
	return doc.id;
}

async function onHand(tx: TestTx, itemId: number, locationId: number) {
	const rows = await tx
		.select({ lotId: stockBalance.lotId, quantity: stockBalance.quantity })
		.from(stockBalance)
		.where(and(eq(stockBalance.itemId, itemId), eq(stockBalance.locationId, locationId)));
	return rows.reduce((sum, r) => sum + Number(r.quantity), 0);
}

/** Posts in a savepoint, so a refusal rolls back only the attempt and the test can go on. */
async function tryPost(tx: TestTx, orgId: number, documentId: number, today = TODAY) {
	try {
		await tx.transaction((sp) => postDocument(sp, { orgId, documentId, today }));
		return null;
	} catch (err) {
		if (err instanceof StockError) return err.message;
		throw err;
	}
}

describe('postDocument', () => {
	it('receives lots, numbers the document, and averages the cost', async () => {
		const result = await inRollback(async (tx) => {
			const biz = await business(tx);
			const amox = await newItem(tx, biz, { trackLots: true, trackExpiry: true });
			const doc = await draft(tx, biz, 'receipt', { to: biz.store }, [
				{ itemId: amox, quantity: 100, unitCost: 2, lotNumber: 'A1', expiryDate: '2027-06-01' },
				{ itemId: amox, quantity: 100, unitCost: 4, lotNumber: 'B2', expiryDate: '2027-01-01' }
			]);
			const { number } = await postDocument(tx, {
				orgId: biz.orgId,
				documentId: doc,
				today: TODAY
			});
			const [it] = await tx.select().from(item).where(eq(item.id, amox));
			const lots = await tx.select().from(lot).where(eq(lot.itemId, amox));
			return {
				number,
				stock: await onHand(tx, amox, biz.store),
				avg: it.avgCost,
				lots: lots.length
			};
		});

		expect(result).toEqual({ number: 'MAIN-GRN-2019-00001', stock: 200, avg: 3, lots: 2 });
	});

	it('issues first-expiry-first-out and never from an expired lot', async () => {
		const result = await inRollback(async (tx) => {
			const biz = await business(tx);
			const amox = await newItem(tx, biz, { trackLots: true, trackExpiry: true });
			// Received in January, when the June lot was still good.
			await postDocument(tx, {
				orgId: biz.orgId,
				today: '2026-01-10',
				documentId: await draft(tx, biz, 'receipt', { to: biz.store }, [
					{ itemId: amox, quantity: 10, lotNumber: 'OLD', expiryDate: '2026-06-01' },
					{ itemId: amox, quantity: 10, lotNumber: 'LATE', expiryDate: '2027-06-01' },
					{ itemId: amox, quantity: 10, lotNumber: 'SOON', expiryDate: '2026-12-01' }
				])
			});

			await postDocument(tx, {
				orgId: biz.orgId,
				today: TODAY,
				documentId: await draft(tx, biz, 'issue', { from: biz.store }, [
					{ itemId: amox, quantity: 15 }
				])
			});

			const byLot = await tx
				.select({ lotNumber: lot.lotNumber, quantity: stockBalance.quantity })
				.from(stockBalance)
				.innerJoin(lot, eq(lot.id, stockBalance.lotId))
				.where(eq(stockBalance.itemId, amox));

			const refused = await tryPost(
				tx,
				biz.orgId,
				await draft(tx, biz, 'issue', { from: biz.store }, [{ itemId: amox, quantity: 6 }])
			);

			return { byLot: Object.fromEntries(byLot.map((r) => [r.lotNumber, r.quantity])), refused };
		});

		// SOON went first, then LATE; the expired OLD lot was not touched.
		expect(result.byLot).toEqual({ OLD: 10, SOON: 0, LATE: 5 });
		// 5 usable remain; 6 is refused, with the reason.
		expect(result.refused).toMatch(/Only 5 tab of Amoxicillin 500mg/);
	});

	it('moves expired stock to quarantine, then writes it off', async () => {
		const result = await inRollback(async (tx) => {
			const biz = await business(tx);
			const milk = await newItem(tx, biz, {
				name: 'Milk powder',
				trackLots: true,
				trackExpiry: true
			});
			await postDocument(tx, {
				orgId: biz.orgId,
				today: '2026-01-10',
				documentId: await draft(tx, biz, 'receipt', { to: biz.store }, [
					{ itemId: milk, quantity: 8, lotNumber: 'M1', expiryDate: '2026-03-01' }
				])
			});

			// Not to an ordinary location...
			const toShop = await tryPost(
				tx,
				biz.orgId,
				await draft(tx, biz, 'transfer', { from: biz.store, to: biz.shop }, [
					{ itemId: milk, quantity: 8 }
				])
			);
			// ...but into quarantine, yes.
			await postDocument(tx, {
				orgId: biz.orgId,
				today: TODAY,
				documentId: await draft(tx, biz, 'transfer', { from: biz.store, to: biz.quarantine }, [
					{ itemId: milk, quantity: 8 }
				])
			});
			await postDocument(tx, {
				orgId: biz.orgId,
				today: TODAY,
				documentId: await draft(tx, biz, 'adjustment', { from: biz.quarantine }, [
					{ itemId: milk, quantity: -8 }
				])
			});

			return {
				toShop,
				store: await onHand(tx, milk, biz.store),
				quarantine: await onHand(tx, milk, biz.quarantine)
			};
		});

		expect(result.toShop).toMatch(/Only 0/);
		expect(result).toMatchObject({ store: 0, quarantine: 0 });
	});

	it('converts pack units to base units', async () => {
		const stock = await inRollback(async (tx) => {
			const biz = await business(tx);
			const para = await newItem(tx, biz, { name: 'Paracetamol' });
			await tx
				.insert(itemUnit)
				.values({ orgId: biz.orgId, itemId: para, uomId: biz.unit('Box'), factor: 100 });
			await postDocument(tx, {
				orgId: biz.orgId,
				today: TODAY,
				documentId: await draft(tx, biz, 'receipt', { to: biz.store }, [
					{ itemId: para, quantity: 3, uomId: biz.unit('Box'), unitCost: 150 }
				])
			});
			const [it] = await tx.select().from(item).where(eq(item.id, para));
			return { qty: await onHand(tx, para, biz.store), avg: it.avgCost };
		});

		// 3 boxes of 100 at 150 a box: 300 tablets at 1.50 each.
		expect(stock).toEqual({ qty: 300, avg: 1.5 });
	});

	it('refuses a unit the item has no conversion for', async () => {
		const refused = await inRollback(async (tx) => {
			const biz = await business(tx);
			const para = await newItem(tx, biz);
			return tryPost(
				tx,
				biz.orgId,
				await draft(tx, biz, 'receipt', { to: biz.store }, [
					{ itemId: para, quantity: 1, uomId: biz.unit('Carton') }
				])
			);
		});
		expect(refused).toMatch(/no conversion/);
	});

	it('tracks serial numbers in and out', async () => {
		const result = await inRollback(async (tx) => {
			const biz = await business(tx);
			const gen = await newItem(tx, biz, {
				name: 'Generator 5kVA',
				trackSerials: true,
				baseUomId: biz.unit('Piece')
			});
			const pcs = biz.unit('Piece');

			const wrongCount = await tryPost(
				tx,
				biz.orgId,
				await draft(tx, biz, 'receipt', { to: biz.store }, [
					{ itemId: gen, quantity: 2, uomId: pcs, serials: 'G-1' }
				])
			);
			await postDocument(tx, {
				orgId: biz.orgId,
				today: TODAY,
				documentId: await draft(tx, biz, 'receipt', { to: biz.store }, [
					{ itemId: gen, quantity: 2, uomId: pcs, serials: 'G-1\nG-2', unitCost: 40000 }
				])
			});
			await postDocument(tx, {
				orgId: biz.orgId,
				today: TODAY,
				documentId: await draft(tx, biz, 'issue', { from: biz.store }, [
					{ itemId: gen, quantity: 1, uomId: pcs, serials: 'G-2' }
				])
			});
			const again = await tryPost(
				tx,
				biz.orgId,
				await draft(tx, biz, 'issue', { from: biz.store }, [
					{ itemId: gen, quantity: 1, uomId: pcs, serials: 'G-2' }
				])
			);

			const units = await tx
				.select({ serial: serialUnit.serialNumber, status: serialUnit.status })
				.from(serialUnit)
				.where(eq(serialUnit.itemId, gen))
				.orderBy(serialUnit.serialNumber);

			return { wrongCount, again, units, stock: await onHand(tx, gen, biz.store) };
		});

		expect(result.wrongCount).toMatch(/exactly 2 serial/);
		expect(result.again).toMatch(/G-2 .* is not in stock/);
		expect(result.units).toEqual([
			{ serial: 'G-1', status: 'in_stock' },
			{ serial: 'G-2', status: 'issued' }
		]);
		expect(result.stock).toBe(1);
	});

	it('refuses receiving a lot that has already expired, or with a changed expiry', async () => {
		const result = await inRollback(async (tx) => {
			const biz = await business(tx);
			const amox = await newItem(tx, biz, { trackLots: true, trackExpiry: true });
			const expired = await tryPost(
				tx,
				biz.orgId,
				await draft(tx, biz, 'receipt', { to: biz.store }, [
					{ itemId: amox, quantity: 1, lotNumber: 'X', expiryDate: '2026-09-27' }
				])
			);
			await postDocument(tx, {
				orgId: biz.orgId,
				today: TODAY,
				documentId: await draft(tx, biz, 'receipt', { to: biz.store }, [
					{ itemId: amox, quantity: 1, lotNumber: 'Y', expiryDate: '2027-01-01' }
				])
			});
			const mismatch = await tryPost(
				tx,
				biz.orgId,
				await draft(tx, biz, 'receipt', { to: biz.store }, [
					{ itemId: amox, quantity: 1, lotNumber: 'Y', expiryDate: '2028-01-01' }
				])
			);
			return { expired, mismatch };
		});

		expect(result.expired).toMatch(/expired on 2026-09-27/);
		expect(result.mismatch).toMatch(/already recorded as expiring 2027-01-01/);
	});

	it('leaves nothing behind when a document is refused', async () => {
		const result = await inRollback(async (tx) => {
			const biz = await business(tx);
			const a = await newItem(tx, biz);
			const b = await newItem(tx, biz, { name: 'Out of stock thing' });
			const doc = await draft(tx, biz, 'receipt', { to: biz.store }, [{ itemId: a, quantity: 5 }]);
			await postDocument(tx, { orgId: biz.orgId, documentId: doc, today: TODAY });

			const bad = await draft(tx, biz, 'issue', { from: biz.store }, [
				{ itemId: a, quantity: 2 },
				{ itemId: b, quantity: 1 }
			]);
			const refused = await tryPost(tx, biz.orgId, bad);
			const [state] = await tx.select().from(stockDocument).where(eq(stockDocument.id, bad));
			const moves = await tx.select().from(stockMovement).where(eq(stockMovement.documentId, bad));
			return {
				refused,
				status: state.status,
				moves: moves.length,
				a: await onHand(tx, a, biz.store)
			};
		});

		expect(result.refused).toMatch(/Out of stock thing/);
		expect(result).toMatchObject({ status: 'draft', moves: 0, a: 5 });
	});

	it('does not post another business’s document', async () => {
		const refused = await inRollback(async (tx) => {
			const one = await business(tx);
			const other = await business(tx);
			const a = await newItem(tx, one);
			const doc = await draft(tx, one, 'receipt', { to: one.store }, [{ itemId: a, quantity: 1 }]);
			return tryPost(tx, other.orgId, doc);
		});
		expect(refused).toMatch(/does not exist/);
	});

	it('numbers each kind of document in its own sequence', async () => {
		const numbers = await inRollback(async (tx) => {
			const biz = await business(tx);
			const a = await newItem(tx, biz);
			const post = async (type: 'receipt' | 'issue', loc: { from?: number; to?: number }) =>
				(
					await postDocument(tx, {
						orgId: biz.orgId,
						today: TODAY,
						documentId: await draft(tx, biz, type, loc, [{ itemId: a, quantity: 1 }])
					})
				).number;
			return [
				await post('receipt', { to: biz.store }),
				await post('receipt', { to: biz.store }),
				await post('issue', { from: biz.store })
			];
		});
		expect(numbers).toEqual(['MAIN-GRN-2019-00001', 'MAIN-GRN-2019-00002', 'MAIN-ISS-2019-00001']);
	});
});

describe('suppliers', () => {
	it('refuses a receipt that names no supplier', async () => {
		const refused = await inRollback(async (tx) => {
			const biz = await business(tx);
			const a = await newItem(tx, biz);
			return tryPost(
				tx,
				biz.orgId,
				await draft(tx, biz, 'receipt', { to: biz.store, supplierId: null }, [
					{ itemId: a, quantity: 5 }
				])
			);
		});
		expect(refused).toMatch(/Choose the supplier/);
	});

	it('gives every movement a supplier, and stock leaving keeps the lot’s supplier', async () => {
		const result = await inRollback(async (tx) => {
			const biz = await business(tx);
			const amox = await newItem(tx, biz, { trackLots: true, trackExpiry: true });
			// Two lots from two suppliers; the other supplier's expires first.
			await postDocument(tx, {
				orgId: biz.orgId,
				today: TODAY,
				documentId: await draft(tx, biz, 'receipt', { to: biz.store }, [
					{ itemId: amox, quantity: 10, lotNumber: 'MAIN-1', expiryDate: '2027-06-01' }
				])
			});
			await postDocument(tx, {
				orgId: biz.orgId,
				today: TODAY,
				documentId: await draft(tx, biz, 'receipt', { to: biz.store, supplierId: biz.other }, [
					{ itemId: amox, quantity: 10, lotNumber: 'OTHER-1', expiryDate: '2027-01-01' }
				])
			});
			const issue = await draft(tx, biz, 'issue', { from: biz.store }, [
				{ itemId: amox, quantity: 15 }
			]);
			await postDocument(tx, { orgId: biz.orgId, documentId: issue, today: TODAY });

			const out = await tx
				.select({ supplierId: stockMovement.supplierId, quantity: stockMovement.quantity })
				.from(stockMovement)
				.where(eq(stockMovement.documentId, issue))
				.orderBy(stockMovement.id);
			const lots = await tx
				.select({ lotNumber: lot.lotNumber, supplierId: lot.supplierId })
				.from(lot)
				.where(eq(lot.itemId, amox));
			return { out, lots, biz };
		});

		expect(result.lots).toEqual(
			expect.arrayContaining([
				{ lotNumber: 'MAIN-1', supplierId: result.biz.supplier },
				{ lotNumber: 'OTHER-1', supplierId: result.biz.other }
			])
		);
		// First expiry first out: 10 from the other supplier's lot, then 5 from the main one's.
		expect(result.out).toEqual([
			{ supplierId: result.biz.other, quantity: -10 },
			{ supplierId: result.biz.supplier, quantity: -5 }
		]);
	});

	it('keeps a serial unit’s supplier when it is issued', async () => {
		const result = await inRollback(async (tx) => {
			const biz = await business(tx);
			const phone = await newItem(tx, biz, {
				name: 'Phone',
				trackSerials: true,
				baseUomId: biz.unit('Piece')
			});
			const pcs = biz.unit('Piece');
			await postDocument(tx, {
				orgId: biz.orgId,
				today: TODAY,
				documentId: await draft(tx, biz, 'receipt', { to: biz.store, supplierId: biz.other }, [
					{ itemId: phone, quantity: 1, uomId: pcs, serials: 'IMEI-1' }
				])
			});
			const issue = await draft(tx, biz, 'issue', { from: biz.store }, [
				{ itemId: phone, quantity: 1, uomId: pcs, serials: 'IMEI-1' }
			]);
			await postDocument(tx, { orgId: biz.orgId, documentId: issue, today: TODAY });
			const [unit] = await tx.select().from(serialUnit).where(eq(serialUnit.itemId, phone));
			const [out] = await tx
				.select()
				.from(stockMovement)
				.where(eq(stockMovement.documentId, issue));
			return { unit: unit.supplierId, out: out.supplierId, other: biz.other };
		});
		// The item's main supplier is someone else; the unit remembers who actually delivered it.
		expect(result).toEqual({ unit: result.other, out: result.other, other: result.other });
	});

	it('credits stock found on a count to the item’s main supplier', async () => {
		const result = await inRollback(async (tx) => {
			const biz = await business(tx);
			const a = await newItem(tx, biz, { name: 'Gloves' });
			const adj = await draft(tx, biz, 'adjustment', { from: biz.store }, [
				{ itemId: a, quantity: 3 }
			]);
			await postDocument(tx, { orgId: biz.orgId, documentId: adj, today: TODAY });
			const [m] = await tx.select().from(stockMovement).where(eq(stockMovement.documentId, adj));
			const noSupplier = await newItem(tx, biz, { name: 'Legacy thing', supplierId: null });
			const refused = await tryPost(
				tx,
				biz.orgId,
				await draft(tx, biz, 'adjustment', { from: biz.store }, [
					{ itemId: noSupplier, quantity: 1 }
				])
			);
			return { supplierId: m.supplierId, main: biz.supplier, refused };
		});
		expect(result.supplierId).toBe(result.main);
		expect(result.refused).toMatch(/no main supplier/);
	});
});
