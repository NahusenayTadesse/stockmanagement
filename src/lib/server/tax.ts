/**
 * VAT and withholding tax, as Ethiopian businesses meet them.
 *
 * VAT. A VAT-registered business adds VAT (15% by default) to standard-rated sales: output VAT. A
 * VAT-registered supplier adds it to what it sells us: input VAT, which a registered business
 * deducts from its output VAT. Zero-rated and exempt items carry none. Prices and costs on lines
 * are before VAT; each line's rate is fixed when the document is posted, so later changes to the
 * business, the supplier or the item never rewrite a posted invoice.
 *
 * Withholding. A withholding agent keeps back part of a payment for goods at or above a threshold
 * (by default 3% of the amount before VAT, from ETB 10,000) and pays it to the tax office, giving
 * the supplier a receipt; a supplier with no TIN is withheld at 30%. A customer who is an agent
 * does the same to us. Withheld tax settles an account exactly as cash does.
 *
 * TOT. A business that is not VAT-registered may instead pay turnover tax on what it sells (2% on
 * goods, more on some services — set per business and per item, both optional). It is added to
 * sale lines like VAT and fixed at posting the same way; a VAT-registered business never charges it.
 *
 * Imported by the posting service and the seed: plain database code only.
 */
import { and, eq, sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import {
	customer,
	item,
	organization,
	stockDocument,
	stockDocumentLine,
	supplier
} from '$lib/server/db/schema';
import { isNull } from 'drizzle-orm';

type Reader = Pick<typeof db, 'select'>;

/** Withholding on payments to a supplier who gives no TIN. */
export const NO_TIN_WITHHOLDING_RATE = 30;

export type TaxSettings = {
	vatRegistered: boolean;
	vatRate: number;
	withholdingAgent: boolean;
	withholdingRate: number;
	withholdingThreshold: number;
	/** Empty: not a TOT payer. */
	totRate: number | null;
};

export async function taxSettings(orgId: number, reader: Reader = db): Promise<TaxSettings> {
	const [org] = await reader
		.select({
			vatRegistered: organization.vatRegistered,
			vatRate: organization.vatRate,
			withholdingAgent: organization.withholdingAgent,
			withholdingRate: organization.withholdingRate,
			withholdingThreshold: organization.withholdingThreshold,
			totRate: organization.totRate
		})
		.from(organization)
		.where(eq(organization.id, orgId));
	return org;
}

type TaxCode = typeof item.$inferSelect.taxCode;

/** VAT on a sale line: only a registered business charges it, and only on standard items. */
export function saleVatRate(settings: TaxSettings, taxCode: TaxCode) {
	return settings.vatRegistered && taxCode === 'standard' ? settings.vatRate : 0;
}

/** VAT on a delivery line: charged by a registered supplier on standard items. */
export function purchaseVatRate(settings: TaxSettings, supplierVat: boolean, taxCode: TaxCode) {
	return supplierVat && taxCode === 'standard' ? settings.vatRate : 0;
}

/**
 * TOT on a sale line, or null: only a TOT payer that is not VAT-registered charges it, at the
 * item's own rate if it has one, else the business's.
 */
export function saleTotRate(settings: TaxSettings, itemTotRate: number | null) {
	if (settings.vatRegistered || settings.totRate === null) return null;
	return itemTotRate ?? settings.totRate;
}

const cents = (n: number) => Math.round(n * 100) / 100;

/** A line's money: before tax, VAT and TOT (each rounded per line, as on the paper), and total. */
export function lineAmounts(
	quantity: number,
	price: number | null,
	vatRate: number | null,
	totRate: number | null = null
) {
	const net = cents(quantity * (price ?? 0));
	const vat = cents((net * (vatRate ?? 0)) / 100);
	const tot = cents((net * (totRate ?? 0)) / 100);
	return { net, vat, tot, gross: cents(net + vat + tot) };
}

/** The price a line is valued at: sales and customer returns by price, the rest by cost. */
const priceSql = sql`CASE WHEN ${stockDocument.type} IN ('issue', 'sales_return') THEN ${stockDocumentLine.unitPrice} ELSE ${stockDocumentLine.unitCost} END`;
/** Per line, rounded as `lineAmounts` rounds. For queries joining document and line. */
export const lineNetSql = sql<number>`ROUND(${stockDocumentLine.quantity} * COALESCE(${priceSql}, 0), 2)`;
export const lineVatSql = sql<number>`ROUND(ROUND(${stockDocumentLine.quantity} * COALESCE(${priceSql}, 0), 2) * COALESCE(${stockDocumentLine.vatRate}, 0) / 100, 2)`;
export const lineTotSql = sql<number>`ROUND(ROUND(${stockDocumentLine.quantity} * COALESCE(${priceSql}, 0), 2) * COALESCE(${stockDocumentLine.totRate}, 0) / 100, 2)`;

/**
 * A document's money, line by line. Posted documents use the rates fixed on their lines; a draft
 * shows what posting would fix now.
 */
export async function documentTotals(orgId: number, documentId: number, reader: Reader = db) {
	const [doc] = await reader
		.select({
			type: stockDocument.type,
			status: stockDocument.status,
			supplierId: stockDocument.supplierId
		})
		.from(stockDocument)
		.where(and(eq(stockDocument.id, documentId), eq(stockDocument.orgId, orgId)));
	if (!doc) return null;

	const [settings, lines, [sup]] = await Promise.all([
		taxSettings(orgId, reader),
		reader
			.select({
				id: stockDocumentLine.id,
				quantity: stockDocumentLine.quantity,
				unitPrice: stockDocumentLine.unitPrice,
				unitCost: stockDocumentLine.unitCost,
				vatRate: stockDocumentLine.vatRate,
				totRate: stockDocumentLine.totRate,
				taxCode: item.taxCode,
				itemTotRate: item.totRate
			})
			.from(stockDocumentLine)
			.innerJoin(item, eq(item.id, stockDocumentLine.itemId))
			.where(
				and(eq(stockDocumentLine.documentId, documentId), isNull(stockDocumentLine.deletedAt))
			),
		doc.supplierId
			? reader
					.select({ vat: supplier.vatRegistered })
					.from(supplier)
					.where(eq(supplier.id, doc.supplierId))
			: Promise.resolve([] as { vat: boolean }[])
	]);

	const byPrice = doc.type === 'issue' || doc.type === 'sales_return';
	const rows = lines.map((l) => {
		const rate =
			l.vatRate ??
			(doc.status !== 'draft'
				? 0
				: doc.type === 'issue'
					? saleVatRate(settings, l.taxCode)
					: doc.type === 'receipt'
						? purchaseVatRate(settings, sup?.vat ?? false, l.taxCode)
						: 0);
		const price = byPrice ? l.unitPrice : l.unitCost;
		const tot =
			l.totRate ??
			(doc.status === 'draft' && doc.type === 'issue'
				? saleTotRate(settings, l.itemTotRate)
				: null);
		return {
			id: l.id,
			vatRate: rate,
			totRate: tot,
			priced: price !== null,
			...lineAmounts(l.quantity, price, rate, tot)
		};
	});
	const sum = (k: 'net' | 'vat' | 'tot' | 'gross') => cents(rows.reduce((s, r) => s + r[k], 0));
	return {
		lines: rows,
		net: sum('net'),
		vat: sum('vat'),
		tot: sum('tot'),
		gross: sum('gross'),
		settings
	};
}

/**
 * The tax a payment for this document should withhold, or 0: ours from a supplier when we are an
 * agent, or a customer's from us when they are one. Based on the amount before VAT.
 */
export async function suggestedWithholding(
	orgId: number,
	doc: { type: string; supplierId: number | null; customerId: number | null },
	net: number,
	reader: Reader = db
) {
	const settings = await taxSettings(orgId, reader);
	if (net < settings.withholdingThreshold) return { amount: 0, rate: 0 };

	if (doc.type === 'receipt' && doc.supplierId && settings.withholdingAgent) {
		const [s] = await reader
			.select({ tin: supplier.tin })
			.from(supplier)
			.where(eq(supplier.id, doc.supplierId));
		const rate = s?.tin ? settings.withholdingRate : NO_TIN_WITHHOLDING_RATE;
		return { amount: cents((net * rate) / 100), rate };
	}
	if (doc.type === 'issue' && doc.customerId) {
		const [c] = await reader
			.select({ withholds: customer.withholdsTax })
			.from(customer)
			.where(eq(customer.id, doc.customerId));
		if (c?.withholds) {
			return {
				amount: cents((net * settings.withholdingRate) / 100),
				rate: settings.withholdingRate
			};
		}
	}
	return { amount: 0, rate: 0 };
}
