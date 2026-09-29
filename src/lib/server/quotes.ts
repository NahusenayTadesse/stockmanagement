/**
 * Proformas (quotations). A proforma prices a possible sale — VAT or TOT included, as the sale
 * would be — and is valid until a date. It changes nothing in stock: converting it makes a draft
 * sale at the quoted prices, which the storekeeper then checks (lots, serials) and posts.
 *
 * Plain database code.
 */
import { error } from '@sveltejs/kit';
import { and, asc, desc, eq, isNull, sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import {
	customer,
	item,
	location,
	quote,
	quoteLine,
	stockDocument,
	stockDocumentLine,
	uom
} from '$lib/server/db/schema';
import { issueNumber, StockError, type Tx } from '$lib/server/stock/post';
import { lineAmounts, saleTotRate, saleVatRate, taxSettings } from '$lib/server/tax';
import { qualified } from '$lib/server/db/sql';

type Conn = typeof db | Tx;
const cents = (n: number) => Math.round(n * 100) / 100;

export async function orgQuote(orgId: number, id: number, reader: Conn = db) {
	const [row] = await reader
		.select()
		.from(quote)
		.where(and(eq(quote.id, id), eq(quote.orgId, orgId), isNull(quote.deletedAt)));
	if (!row) error(404, 'Proforma not found');
	return row;
}

/** The lines with what they come to, taxed as a sale would be today. */
export async function quoteLines(orgId: number, quoteId: number, reader: Conn = db) {
	const [settings, rows] = await Promise.all([
		taxSettings(orgId, reader),
		reader
			.select({
				id: quoteLine.id,
				itemId: quoteLine.itemId,
				item: item.name,
				sku: item.sku,
				uomId: quoteLine.uomId,
				unit: uom.symbol,
				quantity: quoteLine.quantity,
				unitPrice: quoteLine.unitPrice,
				listPrice: quoteLine.listPrice,
				note: quoteLine.note,
				taxCode: item.taxCode,
				itemTotRate: item.totRate
			})
			.from(quoteLine)
			.innerJoin(item, eq(item.id, quoteLine.itemId))
			.innerJoin(uom, eq(uom.id, quoteLine.uomId))
			.where(
				and(eq(quoteLine.orgId, orgId), eq(quoteLine.quoteId, quoteId), isNull(quoteLine.deletedAt))
			)
			.orderBy(asc(quoteLine.id))
	]);
	const lines = rows.map((r) => {
		const vatRate = saleVatRate(settings, r.taxCode);
		const totRate = saleTotRate(settings, r.itemTotRate);
		return { ...r, vatRate, totRate, ...lineAmounts(r.quantity, r.unitPrice, vatRate, totRate) };
	});
	const sum = (k: 'net' | 'vat' | 'tot' | 'gross') => cents(lines.reduce((s, l) => s + l[k], 0));
	return {
		lines,
		totals: { net: sum('net'), vat: sum('vat'), tot: sum('tot'), gross: sum('gross') },
		settings
	};
}

/** Proformas with who they are for and what they come to, for the list. */
export async function quoteList(orgId: number) {
	const total = sql<number>`COALESCE((
		SELECT SUM(${qualified(quoteLine, quoteLine.quantity)} * ${qualified(quoteLine, quoteLine.unitPrice)})
		FROM ${quoteLine}
		WHERE ${qualified(quoteLine, quoteLine.quoteId)} = ${qualified(quote, quote.id)}
			AND ${qualified(quoteLine, quoteLine.deletedAt)} IS NULL
	), 0)`;
	const rows = await db
		.select({
			id: quote.id,
			number: quote.number,
			status: quote.status,
			quoteDate: quote.quoteDate,
			validUntil: quote.validUntil,
			buyer: sql<string>`COALESCE(${customer.name}, ${quote.buyerName}, '—')`,
			customerId: quote.customerId,
			saleId: quote.saleId,
			net: total
		})
		.from(quote)
		.leftJoin(customer, eq(customer.id, quote.customerId))
		.where(and(eq(quote.orgId, orgId), isNull(quote.deletedAt)))
		.orderBy(desc(quote.id))
		.limit(1000);
	return rows.map((r) => ({ ...r, net: cents(Number(r.net)) }));
}

/** Gives a proforma its number the first time it goes out (sent, printed as final). */
export async function numberQuote(tx: Tx, orgId: number, quoteId: number) {
	const q = await orgQuote(orgId, quoteId, tx);
	if (q.number) return q.number;
	const number = await issueNumber(tx, {
		orgId,
		branchId: q.branchId,
		sequence: 'quote',
		prefix: 'PRF',
		date: q.quoteDate
	});
	await tx.update(quote).set({ number }).where(eq(quote.id, q.id));
	return number;
}

/**
 * The proforma as a draft sale: its customer (or buyer's name), its lines at the quoted prices.
 * The proforma is marked converted and points at the sale.
 */
export async function convertQuote(
	tx: Tx,
	input: { orgId: number; quoteId: number; date: string; userId?: string; locationId?: number }
): Promise<number> {
	const q = await orgQuote(input.orgId, input.quoteId, tx);
	if (q.status === 'converted') throw new StockError('This proforma has already become a sale.');
	if (q.status === 'cancelled') throw new StockError('This proforma was cancelled.');
	const { lines } = await quoteLines(input.orgId, q.id, tx);
	if (!lines.length) throw new StockError('Add at least one line first.');

	const locationId = input.locationId ?? q.locationId;
	if (!locationId) throw new StockError('Choose the location the goods will come from.');
	const [loc] = await tx
		.select({ id: location.id, branchId: location.branchId })
		.from(location)
		.where(and(eq(location.id, locationId), eq(location.orgId, input.orgId)));
	if (!loc) throw new StockError('Choose a location from the list.');
	const number = q.number ?? (await numberQuote(tx, input.orgId, q.id));

	const [doc] = await tx
		.insert(stockDocument)
		.values({
			orgId: input.orgId,
			type: 'issue',
			branchId: loc.branchId,
			docDate: input.date,
			fromLocationId: loc.id,
			customerId: q.customerId,
			party: q.customerId ? null : q.buyerName,
			reference: number,
			quoteId: q.id,
			note: q.note,
			createdBy: input.userId
		})
		.$returningId();
	await tx.insert(stockDocumentLine).values(
		lines.map((l) => ({
			orgId: input.orgId,
			documentId: doc.id,
			itemId: l.itemId,
			uomId: l.uomId,
			quantity: l.quantity,
			unitPrice: l.unitPrice,
			listPrice: l.listPrice
		}))
	);
	await tx
		.update(quote)
		.set({ status: 'converted', saleId: doc.id, updatedBy: input.userId ?? null })
		.where(eq(quote.id, q.id));
	return doc.id;
}

/** Proformas can change until they become a sale (or are cancelled). */
export function quoteEditable(status: string) {
	return status === 'draft' || status === 'sent' || status === 'accepted';
}
