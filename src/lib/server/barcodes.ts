/**
 * Barcodes the business prints itself. Items that came without one (local produce, things sold
 * loose, spare parts) get an in-store EAN-13: the `20` prefix is set aside by GS1 for use inside a
 * store, so it can never clash with a manufacturer's code. The rest of the number is the item's
 * id, which makes it unique without a counter to keep.
 *
 * Plain database code, plus `barcodeSvg` for the label sheets.
 */
import { and, eq, inArray, isNull, notExists, sql } from 'drizzle-orm';
import { toSVG } from 'bwip-js/node';
import { db } from '$lib/server/db';
import { barcode, item } from '$lib/server/db/schema';

type Writer = Pick<typeof db, 'select' | 'insert'>;

/** The check digit of a 12-digit EAN-13 body: weights 1 and 3 alternately, from the left. */
export function ean13CheckDigit(body: string): number {
	if (!/^\d{12}$/.test(body)) throw new Error(`Not 12 digits: ${body}`);
	const sum = [...body].reduce((s, d, i) => s + Number(d) * (i % 2 ? 3 : 1), 0);
	return (10 - (sum % 10)) % 10;
}

export function isEan13(code: string): boolean {
	return /^\d{13}$/.test(code) && ean13CheckDigit(code.slice(0, 12)) === Number(code[12]);
}

/** A 12-digit UPC-A is an EAN-13 with a leading zero. */
export function isUpcA(code: string): boolean {
	return /^\d{12}$/.test(code) && isEan13(`0${code}`);
}

/** The in-store code for an item: `20`, the id in ten digits, the check digit. */
export function inStoreCode(itemId: number): string {
	const body = `20${String(itemId).padStart(10, '0')}`;
	if (body.length !== 12) throw new Error(`Item id ${itemId} is too long for an in-store code.`);
	return body + ean13CheckDigit(body);
}

/**
 * Gives every active item of the business that has no barcode an in-store one (or only those in
 * `itemIds`). Returns how many were given. A code someone already typed onto another item is
 * never duplicated: that item is skipped and counted in `clashes`.
 */
export async function generateBarcodes(
	tx: Writer,
	orgId: number,
	itemIds?: number[]
): Promise<{ given: number; clashes: number }> {
	const bare = await tx
		.select({ id: item.id })
		.from(item)
		.where(
			and(
				eq(item.orgId, orgId),
				isNull(item.deletedAt),
				eq(item.isActive, true),
				itemIds ? inArray(item.id, itemIds.length ? itemIds : [-1]) : undefined,
				notExists(
					tx
						.select({ one: sql`1` })
						.from(barcode)
						.where(and(eq(barcode.itemId, item.id), isNull(barcode.deletedAt)))
				)
			)
		);
	if (!bare.length) return { given: 0, clashes: 0 };

	const wanted = bare.map((b) => ({ itemId: b.id, code: inStoreCode(b.id) }));
	const taken = new Set(
		(
			await tx
				.select({ code: barcode.code })
				.from(barcode)
				.where(
					and(
						eq(barcode.orgId, orgId),
						isNull(barcode.deletedAt),
						inArray(
							barcode.code,
							wanted.map((w) => w.code)
						)
					)
				)
		).map((r) => r.code)
	);
	const fresh = wanted.filter((w) => !taken.has(w.code));
	if (fresh.length) {
		await tx.insert(barcode).values(fresh.map((w) => ({ orgId, itemId: w.itemId, code: w.code })));
	}
	return { given: fresh.length, clashes: wanted.length - fresh.length };
}

/** How many active items have no barcode at all. */
export async function itemsWithoutBarcode(orgId: number, reader: Pick<typeof db, 'select'> = db) {
	const [row] = await reader
		.select({ n: sql<number>`COUNT(*)` })
		.from(item)
		.where(
			and(
				eq(item.orgId, orgId),
				isNull(item.deletedAt),
				eq(item.isActive, true),
				notExists(
					reader
						.select({ one: sql`1` })
						.from(barcode)
						.where(and(eq(barcode.itemId, item.id), isNull(barcode.deletedAt)))
				)
			)
		);
	return Number(row?.n ?? 0);
}

/**
 * The code drawn as SVG: EAN-13 (or UPC-A) when it is one, with its digits underneath; anything
 * else — an SKU, a supplier's own code — as Code 128, which takes letters too.
 */
export function barcodeSvg(code: string, options: { height?: number } = {}): string {
	const height = options.height ?? 12;
	try {
		if (isEan13(code)) {
			return toSVG({ bcid: 'ean13', text: code, includetext: true, height, textsize: 9 });
		}
		if (isUpcA(code)) {
			return toSVG({ bcid: 'upca', text: code, includetext: true, height, textsize: 9 });
		}
		return toSVG({
			bcid: 'code128',
			text: code,
			includetext: true,
			textxalign: 'center',
			height,
			textsize: 9
		});
	} catch {
		// Characters Code 128 cannot carry (Ge'ez, say): no bars, the text alone.
		return '';
	}
}
