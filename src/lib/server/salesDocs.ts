/**
 * A sale as the papers print it — the till receipt and the tax invoice: who sold, who bought,
 * every line with its tax, the payments, and the fiscal and e-invoice marks.
 */
import { error } from '@sveltejs/kit';
import { and, asc, eq, isNull, or } from 'drizzle-orm';
import QRCode from 'qrcode';
import { db } from '$lib/server/db';
import {
	branch,
	customer,
	item,
	organization,
	paymentMethod,
	quote,
	stockDocument,
	stockDocumentLine,
	transactions,
	uom,
	user
} from '$lib/server/db/schema';
import { documentTotals } from '$lib/server/tax';
import { m } from '$lib/paraglide/messages.js';
import { getLocale } from '$lib/paraglide/runtime';
import { cents } from '$lib/money';

export async function saleForPrint(orgId: number, documentId: number) {
	const [row] = await db
		.select({
			doc: stockDocument,
			org: {
				name: organization.name,
				tin: organization.tin,
				phone: organization.phone,
				address: organization.address,
				logo: organization.logo,
				vatRegistered: organization.vatRegistered,
				totRate: organization.totRate
			},
			branch: { name: branch.name, address: branch.address, phone: branch.phone },
			buyer: {
				name: customer.name,
				tin: customer.tin,
				phone: customer.phone,
				address: customer.address
			},
			quoteBuyer: { name: quote.buyerName, tin: quote.buyerTin, number: quote.number },
			seller: user.name
		})
		.from(stockDocument)
		.innerJoin(organization, eq(organization.id, stockDocument.orgId))
		.innerJoin(branch, eq(branch.id, stockDocument.branchId))
		.leftJoin(customer, eq(customer.id, stockDocument.customerId))
		.leftJoin(quote, eq(quote.id, stockDocument.quoteId))
		.leftJoin(user, eq(user.id, stockDocument.createdBy))
		.where(and(eq(stockDocument.id, documentId), eq(stockDocument.orgId, orgId)));
	if (!row || (row.doc.type !== 'issue' && row.doc.type !== 'sales_return')) {
		error(404, m.sales_sale_not_found());
	}

	const [lines, totals, payments] = await Promise.all([
		db
			.select({
				id: stockDocumentLine.id,
				item: item.name,
				itemAm: item.nameAm,
				sku: item.sku,
				unit: uom.symbol,
				quantity: stockDocumentLine.quantity,
				unitPrice: stockDocumentLine.unitPrice,
				listPrice: stockDocumentLine.listPrice,
				serials: stockDocumentLine.serials
			})
			.from(stockDocumentLine)
			.innerJoin(item, eq(item.id, stockDocumentLine.itemId))
			.innerJoin(uom, eq(uom.id, stockDocumentLine.uomId))
			.where(and(eq(stockDocumentLine.documentId, documentId), isNull(stockDocumentLine.deletedAt)))
			.orderBy(asc(stockDocumentLine.id)),
		documentTotals(orgId, documentId),
		db
			.select({
				id: transactions.id,
				method: paymentMethod.name,
				amount: transactions.amount,
				withheld: transactions.withheld,
				reference: transactions.reference
			})
			.from(transactions)
			.leftJoin(paymentMethod, eq(paymentMethod.id, transactions.paymentMethodId))
			.where(
				and(
					eq(transactions.orgId, orgId),
					or(
						eq(transactions.documentId, documentId),
						row.doc.transactionId ? eq(transactions.id, row.doc.transactionId) : undefined
					),
					eq(transactions.direction, row.doc.type === 'issue' ? 'in' : 'out')
				)
			)
			.orderBy(asc(transactions.id))
	]);

	const byLine = new Map((totals?.lines ?? []).map((l) => [l.id, l]));
	const paid = payments.reduce((s, p) => s + p.amount + p.withheld, 0);
	return {
		doc: row.doc,
		org: row.org,
		branch: row.branch,
		seller: row.seller,
		buyer: row.buyer?.name
			? row.buyer
			: row.quoteBuyer?.name
				? { name: row.quoteBuyer.name, tin: row.quoteBuyer.tin, phone: null, address: null }
				: row.doc.party
					? { name: row.doc.party, tin: null, phone: null, address: null }
					: null,
		quoteNumber: row.quoteBuyer?.number ?? null,
		lines: lines.map((l) => ({
			...l,
			// The Amharic name on an Amharic paper, where the item has one.
			item: getLocale() === 'am' && l.itemAm ? l.itemAm : l.item,
			...(byLine.get(l.id) ?? { net: 0, vat: 0, tot: 0, gross: 0 })
		})),
		totals: totals && { net: totals.net, vat: totals.vat, tot: totals.tot, gross: totals.gross },
		payments,
		balance: Math.max(0, cents((totals?.gross ?? 0) - paid)),
		qr: row.doc.einvoiceQr
			? await QRCode.toDataURL(row.doc.einvoiceQr, { margin: 1, width: 160 })
			: null
	};
}

const ONES = [
	'',
	'one',
	'two',
	'three',
	'four',
	'five',
	'six',
	'seven',
	'eight',
	'nine',
	'ten',
	'eleven',
	'twelve',
	'thirteen',
	'fourteen',
	'fifteen',
	'sixteen',
	'seventeen',
	'eighteen',
	'nineteen'
];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

function words(n: number): string {
	if (n < 20) return ONES[n];
	if (n < 100) return `${TENS[Math.floor(n / 10)]}${n % 10 ? `-${ONES[n % 10]}` : ''}`;
	if (n < 1000) return `${ONES[Math.floor(n / 100)]} hundred${n % 100 ? ` ${words(n % 100)}` : ''}`;
	for (const [size, name] of [
		[1e9, 'billion'],
		[1e6, 'million'],
		[1e3, 'thousand']
	] as const) {
		if (n >= size) {
			const rest = n % size;
			return `${words(Math.floor(n / size))} ${name}${rest ? ` ${words(rest)}` : ''}`;
		}
	}
	return String(n);
}

const AM_ONES = ['', 'አንድ', 'ሁለት', 'ሦስት', 'አራት', 'አምስት', 'ስድስት', 'ሰባት', 'ስምንት', 'ዘጠኝ'];
const AM_TENS = ['', 'አሥር', 'ሃያ', 'ሠላሳ', 'አርባ', 'ሃምሳ', 'ስልሳ', 'ሰባ', 'ሰማንያ', 'ዘጠና'];

/** The same in Amharic: 2,350 → "ሁለት ሺህ ሦስት መቶ ሃምሳ". */
function amharicWords(n: number): string {
	if (n < 10) return AM_ONES[n];
	if (n < 20) return n === 10 ? AM_TENS[1] : `አሥራ ${AM_ONES[n - 10]}`;
	if (n < 100) return `${AM_TENS[Math.floor(n / 10)]}${n % 10 ? ` ${AM_ONES[n % 10]}` : ''}`;
	if (n < 1000) {
		return `${AM_ONES[Math.floor(n / 100)]} መቶ${n % 100 ? ` ${amharicWords(n % 100)}` : ''}`;
	}
	for (const [size, name] of [
		[1e9, 'ቢሊዮን'],
		[1e6, 'ሚሊዮን'],
		[1e3, 'ሺህ']
	] as const) {
		if (n >= size) {
			const rest = n % size;
			return `${amharicWords(Math.floor(n / size))} ${name}${rest ? ` ${amharicWords(rest)}` : ''}`;
		}
	}
	return String(n);
}

/**
 * "Two thousand three hundred birr and fifty cents" — invoices here state the total in words.
 * In Amharic: "ሁለት ሺህ ሦስት መቶ ብር ከሃምሳ ሳንቲም".
 */
export function amountInWords(amount: number, locale: string = getLocale()) {
	const birr = Math.floor(amount);
	const cents = Math.round((amount - birr) * 100);
	if (locale === 'am') {
		return `${birr ? amharicWords(birr) : 'ዜሮ'} ብር${cents ? ` ከ${amharicWords(cents)} ሳንቲም` : ''}`;
	}
	const text = `${birr ? words(birr) : 'zero'} birr${cents ? ` and ${words(cents)} cents` : ''}`;
	return text.charAt(0).toUpperCase() + text.slice(1);
}
