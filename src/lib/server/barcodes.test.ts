import { beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { configureKit } from '@nahu/admin-kit/server/db';
import { inRollback } from '@nahu/admin-kit/server/testing/rollback';

import { db } from '$lib/server/db';
import { barcode, item, supplier, uom } from '$lib/server/db/schema';
import { createOrganization } from '$lib/server/seedPermissions';
import {
	barcodeSvg,
	ean13CheckDigit,
	generateBarcodes,
	inStoreCode,
	isEan13,
	isUpcA
} from './barcodes';

beforeAll(() => configureKit({ db }));

describe('EAN-13', () => {
	it('computes check digits and recognises valid codes', () => {
		// Real codes: a bottle of water and a GS1 example.
		expect(ean13CheckDigit('629104150021')).toBe(3);
		expect(ean13CheckDigit('400638133393')).toBe(1);
		expect(isEan13('4006381333931')).toBe(true);
		expect(isEan13('4006381333932')).toBe(false);
		expect(isUpcA('036000291452')).toBe(true);
		expect(inStoreCode(42)).toBe('2000000000428');
		expect(isEan13(inStoreCode(987654))).toBe(true);
	});

	it('draws EAN-13 for EAN codes and Code 128 for anything else', () => {
		expect(barcodeSvg('4006381333931')).toMatch(/^<svg/);
		expect(barcodeSvg('SKU-12/A')).toMatch(/^<svg/);
	});
});

describe('generating', () => {
	it('gives in-store codes only to items without one, never duplicating a code', async () => {
		const r = await inRollback(async (tx) => {
			const { orgId } = await createOrganization(tx, { name: 'Barcode test' });
			const [pcs] = await tx.select().from(uom).where(eq(uom.orgId, orgId)).limit(1);
			const [sup] = await tx
				.insert(supplier)
				.values({ orgId, name: 'S', phone: '0911' })
				.$returningId();
			const make = async (sku: string) =>
				(
					await tx
						.insert(item)
						.values({ orgId, sku, name: sku, baseUomId: pcs.id, supplierId: sup.id })
						.$returningId()
				)[0].id;
			const a = await make('A');
			const b = await make('B');
			const c = await make('C');
			await tx.insert(barcode).values({ orgId, itemId: a, code: '4006381333931' });
			// Someone typed C's in-store code onto B by hand.
			await tx.insert(barcode).values({ orgId, itemId: b, code: inStoreCode(c) });
			const first = await generateBarcodes(tx, orgId);
			const again = await generateBarcodes(tx, orgId);
			const codes = await tx.select().from(barcode).where(eq(barcode.orgId, orgId));
			return { first, again, codes, c };
		});
		// Only C was bare, and its code is taken: nothing given, one clash.
		expect(r.first).toEqual({ given: 0, clashes: 1 });
		expect(r.again).toEqual({ given: 0, clashes: 1 });
		expect(r.codes).toHaveLength(2);
	});

	it('gives a bare item its in-store code', async () => {
		const r = await inRollback(async (tx) => {
			const { orgId } = await createOrganization(tx, { name: 'Barcode test 2' });
			const [pcs] = await tx.select().from(uom).where(eq(uom.orgId, orgId)).limit(1);
			const [sup] = await tx
				.insert(supplier)
				.values({ orgId, name: 'S', phone: '0911' })
				.$returningId();
			const [x] = await tx
				.insert(item)
				.values({ orgId, sku: 'X', name: 'X', baseUomId: pcs.id, supplierId: sup.id })
				.$returningId();
			const given = await generateBarcodes(tx, orgId, [x.id]);
			const codes = await tx.select().from(barcode).where(eq(barcode.itemId, x.id));
			return { given, codes, id: x.id };
		});
		expect(r.given).toEqual({ given: 1, clashes: 0 });
		expect(r.codes.map((c) => c.code)).toEqual([inStoreCode(r.id)]);
	});
});
