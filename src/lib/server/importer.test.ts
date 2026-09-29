import { beforeAll, describe, expect, it } from 'vitest';
import { and, eq, isNull } from 'drizzle-orm';
import { configureKit } from '@nahu/admin-kit/server/db';
import { inRollback, type TestTx } from '@nahu/admin-kit/server/testing/rollback';

import { db } from '$lib/server/db';
import {
	barcode,
	category,
	item,
	itemUnit,
	lot,
	stockBalance,
	stockDocument,
	supplier,
	uom
} from '$lib/server/db/schema';
import { createOrganization } from '$lib/server/seedPermissions';
import {
	ImportError,
	parseCsv,
	planImport,
	readTable,
	runImport,
	templateCsv,
	type ImportKind
} from './importer';

beforeAll(() => configureKit({ db }));

const TODAY = '2026-09-29';

/** A CSV file as the page would receive it. */
const csv = (text: string) => ({ name: 'data.csv', bytes: new TextEncoder().encode(text) });

async function rows(kind: ImportKind, text: string) {
	return (await readTable(kind, csv(text))).rows;
}

async function refusal(promise: Promise<unknown>) {
	try {
		await promise;
		return null;
	} catch (err) {
		if (err instanceof ImportError) return err.message;
		throw err;
	}
}

async function start(tx: TestTx) {
	const { orgId } = await createOrganization(tx, { name: 'Import test' });
	await runImport(tx, {
		orgId,
		kind: 'suppliers',
		today: TODAY,
		rows: await rows('suppliers', 'Name,Phone,VAT registered\nMugher Cement,0911 000 001,yes\n')
	});
	return orgId;
}

describe('reading files', () => {
	it('parses quoted CSV and matches headers loosely', async () => {
		expect(parseCsv('a,"b, c","say ""hi"""\r\n1,2,3')).toEqual([
			['a', 'b, c', 'say "hi"'],
			['1', '2', '3']
		]);
		const read = await readTable(
			'items',
			csv('\uFEFFItem Code;NAME;base_unit;Colour\nX-1;Nail;kg;red\n\n')
		);
		expect(read.rows).toEqual([{ row: 2, values: { sku: 'X-1', name: 'Nail', unit: 'kg' } }]);
		expect(read.ignored).toEqual(['Colour']);
		expect(await refusal(readTable('items', csv('Foo,Bar\n1,2')))).toMatch(/None of the columns/);
		expect(templateCsv('opening').split('\r\n')[0]).toMatch(/^\uFEFFSKU,Location,Quantity/);
	});
});

describe('importing', () => {
	it('creates and then updates items, with a pack unit and barcodes', async () => {
		const r = await inRollback(async (tx) => {
			const orgId = await start(tx);
			const first = await runImport(tx, {
				orgId,
				kind: 'items',
				today: TODAY,
				rows: await rows(
					'items',
					[
						'SKU,Name,Category,Unit,Sale price,Main supplier,Barcode,Pack unit,Pack factor,Pack barcode',
						'CEM-50,Cement 50 kg,Building,Piece,"1,450",Mugher Cement,6291041500213,Pallet,40,P-CEM'
					].join('\n')
				)
			});
			const plan = await planImport(
				tx,
				orgId,
				'items',
				await rows('items', 'SKU,Sale price,VAT\nCEM-50,1500,exempt\n')
			);
			const second = await runImport(tx, {
				orgId,
				kind: 'items',
				today: TODAY,
				rows: await rows('items', 'SKU,Sale price,VAT\nCEM-50,1500,exempt\n')
			});
			const [it] = await tx.select().from(item).where(eq(item.orgId, orgId));
			const codes = await tx
				.select({ code: barcode.code, uomId: barcode.uomId })
				.from(barcode)
				.where(eq(barcode.itemId, it.id));
			const packs = await tx
				.select({ factor: itemUnit.factor, unit: uom.name })
				.from(itemUnit)
				.innerJoin(uom, eq(uom.id, itemUnit.uomId))
				.where(eq(itemUnit.itemId, it.id));
			const [cat] = await tx
				.select({ name: category.name })
				.from(category)
				.where(eq(category.id, it.categoryId!));
			const [sup] = await tx
				.select({ name: supplier.name })
				.from(supplier)
				.where(eq(supplier.id, it.supplierId!));
			return { first, plan, second, it, codes, packs, cat, sup };
		});
		expect(r.first).toMatchObject({ created: 1, updated: 0 });
		expect(r.plan.rows[0]).toMatchObject({ action: 'update', errors: [] });
		expect(r.second).toMatchObject({ created: 0, updated: 1 });
		expect(r.it).toMatchObject({ name: 'Cement 50 kg', salePrice: 1500, taxCode: 'exempt' });
		expect(r.cat.name).toBe('Building');
		expect(r.sup.name).toBe('Mugher Cement');
		expect(r.packs).toEqual([{ factor: 40, unit: 'Pallet' }]);
		expect(r.codes.map((c) => c.code).sort()).toEqual(['6291041500213', 'P-CEM']);
		expect(r.codes.find((c) => c.code === 'P-CEM')?.uomId).not.toBeNull();
	});

	it('reports bad rows in the preview and imports nothing while any remain', async () => {
		const r = await inRollback(async (tx) => {
			const orgId = await start(tx);
			const text = [
				'SKU,Name,Unit,Main supplier,Sale price,Track lots',
				'A-1,Good one,Piece,Mugher Cement,10,no',
				'A-1,Same code,Piece,Mugher Cement,10,no',
				'B-2,Unknown supplier,Piece,Nobody Ltd,abc,maybe',
				',No code,Piece,Mugher Cement,,'
			].join('\n');
			const plan = await planImport(tx, orgId, 'items', await rows('items', text));
			const all = await refusal(
				tx.transaction(async (sp) =>
					runImport(sp, { orgId, kind: 'items', today: TODAY, rows: await rows('items', text) })
				)
			);
			const items = await tx.select().from(item).where(eq(item.orgId, orgId));
			return { plan, all, items };
		});
		const errs = r.plan.rows.map((p) => p.errors.join(' | '));
		expect(errs[0]).toBe('');
		expect(errs[1]).toMatch(/SKU A-1 is also on row 2/);
		expect(errs[2]).toMatch(/Nobody Ltd.*not on the list/);
		expect(errs[2]).toMatch(/“abc” is not a number/);
		expect(errs[2]).toMatch(/write yes or no/);
		expect(errs[3]).toMatch(/SKU is empty/);
		expect(r.plan.counts).toMatchObject({ create: 1, errors: 3 });
		expect(r.all).toMatch(/Nothing was imported: 3 row\(s\) have problems\. Row 3/);
		expect(r.items).toEqual([]);
	});

	it('posts opening stock as one adjustment per location, lots and all', async () => {
		const r = await inRollback(async (tx) => {
			const orgId = await start(tx);
			await runImport(tx, {
				orgId,
				kind: 'items',
				today: TODAY,
				rows: await rows(
					'items',
					[
						'SKU,Name,Unit,Main supplier,Track expiry',
						'AMX,Amoxicillin,Tablet,Mugher Cement,yes',
						'NAIL,Nail,Kilogram,Mugher Cement,no'
					].join('\n')
				)
			});
			const text = [
				'SKU,Location,Quantity,Unit cost,Lot,Expiry',
				'AMX,Main Store,100,2.5,L-1,2027-03-31',
				'AMX,Main Branch · Main Store,50,3,L-2,31/12/2027',
				'NAIL,Main Store,12.5,80,,'
			].join('\n');
			const result = await runImport(tx, {
				orgId,
				kind: 'opening',
				today: TODAY,
				rows: await rows('opening', text)
			});
			const lots = await tx
				.select({ number: lot.lotNumber, expiry: lot.expiryDate })
				.from(lot)
				.where(eq(lot.orgId, orgId));
			const balances = await tx
				.select({ quantity: stockBalance.quantity })
				.from(stockBalance)
				.where(eq(stockBalance.orgId, orgId));
			const docs = await tx
				.select({ reason: stockDocument.reason, status: stockDocument.status })
				.from(stockDocument)
				.where(and(eq(stockDocument.orgId, orgId), isNull(stockDocument.deletedAt)));
			const [amx] = await tx
				.select({ avg: item.avgCost })
				.from(item)
				.where(and(eq(item.orgId, orgId), eq(item.sku, 'AMX')));
			const missingLot = await planImport(
				tx,
				orgId,
				'opening',
				await rows('opening', 'SKU,Location,Quantity\nAMX,Main Store,5\nNAIL,Nowhere,1\n')
			);
			return { result, lots, balances, docs, amx, missingLot };
		});
		expect(r.result.documents).toHaveLength(1);
		expect(r.result.documents[0].number).toMatch(/-ADJ-/);
		expect(r.docs).toEqual([{ reason: 'opening', status: 'posted' }]);
		expect(r.lots.sort((a, b) => a.number.localeCompare(b.number))).toEqual([
			{ number: 'L-1', expiry: '2027-03-31' },
			{ number: 'L-2', expiry: '2027-12-31' }
		]);
		expect(r.balances.map((b) => b.quantity).sort((a, b) => a - b)).toEqual([12.5, 50, 100]);
		// (100 × 2.5 + 50 × 3) / 150
		expect(r.amx.avg).toBeCloseTo(2.6667, 3);
		expect(r.missingLot.rows[0].errors.join(' ')).toMatch(/give the lot/);
		expect(r.missingLot.rows[1].errors.join(' ')).toMatch(/No location is called “Nowhere”/);
	});
});
