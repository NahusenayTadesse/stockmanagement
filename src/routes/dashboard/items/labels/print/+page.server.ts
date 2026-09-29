import { error } from '@sveltejs/kit';
import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import { db } from '$lib/server/db';
import {
	barcode,
	item,
	itemUnit,
	organization,
	stockDocument,
	stockDocumentLine,
	uom
} from '$lib/server/db/schema';
import { orgIdOf } from '$lib/server/tenant';
import { barcodeSvg } from '$lib/server/barcodes';
import { lineAmounts, saleTotRate, saleVatRate, taxSettings } from '$lib/server/tax';
import type { PageServerLoad } from './$types';

/** No sheet runs past this: a slip of the keyboard should not print a ream. */
const MAX_LABELS = 2000;
const MAX_COPIES = 500;

/**
 * The label sheet. `?pick=12:3,15:1` (item:copies) or `?document=<receipt id>` (a label per unit
 * received), and `?type=shelf|item`.
 */
export const load: PageServerLoad = async ({ url, locals }) => {
	const orgId = orgIdOf(locals);
	const type = url.searchParams.get('type') === 'item' ? 'item' : 'shelf';
	const copies = new Map<number, number>();
	let source: string | null = null;

	const documentId = Number(url.searchParams.get('document'));
	if (documentId) {
		const [doc] = await db
			.select({ id: stockDocument.id, number: stockDocument.number, type: stockDocument.type })
			.from(stockDocument)
			.where(
				and(
					eq(stockDocument.id, documentId),
					eq(stockDocument.orgId, orgId),
					eq(stockDocument.status, 'posted')
				)
			);
		if (!doc || doc.type !== 'receipt') error(404, 'Posted receipt not found');
		source = doc.number;
		const lines = await db
			.select({
				itemId: stockDocumentLine.itemId,
				uomId: stockDocumentLine.uomId,
				quantity: stockDocumentLine.quantity,
				baseUomId: item.baseUomId,
				factor: itemUnit.factor
			})
			.from(stockDocumentLine)
			.innerJoin(item, eq(item.id, stockDocumentLine.itemId))
			.leftJoin(
				itemUnit,
				and(
					eq(itemUnit.itemId, stockDocumentLine.itemId),
					eq(itemUnit.uomId, stockDocumentLine.uomId),
					isNull(itemUnit.deletedAt)
				)
			)
			.where(and(eq(stockDocumentLine.documentId, doc.id), isNull(stockDocumentLine.deletedAt)));
		for (const l of lines) {
			const base = l.uomId === l.baseUomId ? l.quantity : l.quantity * (l.factor ?? 1);
			copies.set(l.itemId, (copies.get(l.itemId) ?? 0) + Math.ceil(base));
		}
	} else {
		for (const part of (url.searchParams.get('pick') ?? '').split(',')) {
			const [id, n] = part.split(':').map(Number);
			if (Number.isInteger(id) && id > 0) copies.set(id, Number.isInteger(n) && n > 0 ? n : 1);
		}
	}

	const ids = [...copies.keys()];
	const [items, codes, settings, [org]] = await Promise.all([
		ids.length
			? db
					.select({
						id: item.id,
						sku: item.sku,
						name: item.name,
						nameAm: item.nameAm,
						variantLabel: item.variantLabel,
						salePrice: item.salePrice,
						taxCode: item.taxCode,
						totRate: item.totRate,
						unit: uom.symbol
					})
					.from(item)
					.innerJoin(uom, eq(uom.id, item.baseUomId))
					.where(and(eq(item.orgId, orgId), inArray(item.id, ids), isNull(item.deletedAt)))
					.orderBy(asc(item.name))
			: Promise.resolve([]),
		ids.length
			? db
					.select({ itemId: barcode.itemId, code: barcode.code, uomId: barcode.uomId })
					.from(barcode)
					.where(
						and(eq(barcode.orgId, orgId), inArray(barcode.itemId, ids), isNull(barcode.deletedAt))
					)
					.orderBy(asc(barcode.id))
			: Promise.resolve([]),
		taxSettings(orgId),
		db.select({ name: organization.name }).from(organization).where(eq(organization.id, orgId))
	]);

	let left = MAX_LABELS;
	const labels = items.map((it) => {
		// The single unit's code before a pack's: the label goes on the shelf edge or the unit.
		const code =
			codes.find((c) => c.itemId === it.id && c.uomId === null)?.code ??
			codes.find((c) => c.itemId === it.id)?.code ??
			null;
		const vat = saleVatRate(settings, it.taxCode);
		const tot = saleTotRate(settings, it.totRate);
		const n = Math.min(copies.get(it.id) ?? 1, MAX_COPIES, left);
		left -= n;
		return {
			id: it.id,
			sku: it.sku,
			name: it.variantLabel ? `${it.name} — ${it.variantLabel}` : it.name,
			nameAm: it.nameAm,
			unit: it.unit,
			// Shelf prices are what the customer pays: VAT or TOT included.
			price: it.salePrice === null ? null : lineAmounts(1, it.salePrice, vat, tot).gross,
			taxNote: vat ? 'incl. VAT' : tot ? 'incl. TOT' : null,
			code: code ?? it.sku,
			svg: barcodeSvg(code ?? it.sku, { height: type === 'shelf' ? 10 : 8 }),
			copies: n
		};
	});

	return {
		type,
		source,
		org,
		labels: labels.filter((l) => l.copies > 0),
		truncated: left === 0
	};
};
