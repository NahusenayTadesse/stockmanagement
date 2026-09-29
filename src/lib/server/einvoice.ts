/**
 * Electronic invoicing with the Ministry of Revenues: a posted sale (or, as a credit note, a
 * customer return) is sent as a structured invoice; the tax office answers with an invoice
 * reference number (IRN) and the data for the invoice's QR code, both kept on the document.
 *
 * Optional throughout: off unless the business turns it on (Business profile).
 *   - sandbox: nothing leaves the server. The IRN is derived from the invoice itself and marked
 *     SBX-, so a business can see the whole flow before it has credentials.
 *   - live: POSTs the invoice to the endpoint the business configured, with an OAuth2
 *     client-credentials token when a token URL is set (Basic auth otherwise).
 *
 * `toProviderPayload` is the one place that knows the tax office's field names. It follows the
 * usual shape of national e-invoicing APIs (seller/buyer/lines/totals/IRN); align it with the
 * Ministry's published specification before going live — nothing else needs to change.
 */
import { m } from '$lib/paraglide/messages.js';
import { createHash } from 'node:crypto';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '$lib/server/db';
import {
	customer,
	item,
	organization,
	stockDocument,
	stockDocumentLine,
	uom
} from '$lib/server/db/schema';
import { unseal } from '$lib/server/secrets';
import { lineAmounts } from '$lib/server/tax';
import type { Tx } from '$lib/server/stock/post';
import { cents } from '$lib/money';

/** The database, or a caller's transaction (the seed issues invoices inside its own). */
type Conn = typeof db | Tx;

export class EinvoiceError extends Error {}

/** The invoice, in our own terms, from a posted sale or customer return. */
export async function invoiceFor(orgId: number, documentId: number, conn: Conn = db) {
	const [row] = await conn
		.select({ doc: stockDocument, org: organization, buyer: customer })
		.from(stockDocument)
		.innerJoin(organization, eq(organization.id, stockDocument.orgId))
		.leftJoin(customer, eq(customer.id, stockDocument.customerId))
		.where(and(eq(stockDocument.id, documentId), eq(stockDocument.orgId, orgId)));
	if (!row) throw new EinvoiceError(m.sales_ret_no_doc());
	const { doc, org, buyer } = row;
	if (doc.status !== 'posted' || (doc.type !== 'issue' && doc.type !== 'sales_return')) {
		throw new EinvoiceError(m.sales_einv_posted_only());
	}
	if (!org.tin) throw new EinvoiceError(m.sales_einv_set_tin());

	const lines = await conn
		.select({
			line: stockDocumentLine,
			sku: item.sku,
			name: item.name,
			unit: uom.symbol
		})
		.from(stockDocumentLine)
		.innerJoin(item, eq(item.id, stockDocumentLine.itemId))
		.innerJoin(uom, eq(uom.id, stockDocumentLine.uomId))
		.where(and(eq(stockDocumentLine.documentId, doc.id), isNull(stockDocumentLine.deletedAt)));
	if (!lines.length || lines.some((l) => l.line.unitPrice === null)) {
		throw new EinvoiceError(m.sales_einv_every_line_priced());
	}

	let original: { number: string | null; irn: string | null } | null = null;
	if (doc.type === 'sales_return' && doc.returnOfId) {
		const [o] = await conn
			.select({ number: stockDocument.number, irn: stockDocument.einvoiceIrn })
			.from(stockDocument)
			.where(eq(stockDocument.id, doc.returnOfId));
		original = o ?? null;
	}

	const invoiceLines = lines.map((l, i) => {
		const a = lineAmounts(l.line.quantity, l.line.unitPrice, l.line.vatRate, l.line.totRate);
		return {
			no: i + 1,
			sku: l.sku,
			description: l.name,
			quantity: l.line.quantity,
			unit: l.unit,
			unitPrice: l.line.unitPrice!,
			net: a.net,
			vatRate: l.line.vatRate ?? 0,
			vat: a.vat,
			totRate: l.line.totRate ?? 0,
			tot: a.tot,
			total: a.gross
		};
	});
	const sum = (k: 'net' | 'vat' | 'tot' | 'total') =>
		cents(invoiceLines.reduce((s, l) => s + l[k], 0));

	return {
		documentId: doc.id,
		type: doc.type === 'sales_return' ? ('credit_note' as const) : ('invoice' as const),
		number: doc.number ?? `#${doc.id}`,
		issueDate: doc.docDate,
		currency: 'ETB',
		seller: {
			tin: org.tin,
			name: org.name,
			address: org.address,
			phone: org.phone,
			vatRegistered: org.vatRegistered,
			totPayer: !org.vatRegistered && org.totRate !== null
		},
		buyer: buyer
			? { tin: buyer.tin, name: buyer.name, phone: buyer.phone, address: buyer.address }
			: null,
		fiscal: { fsNumber: doc.fiscalReceiptNumber, machineCode: doc.fiscalMachineCode },
		original,
		lines: invoiceLines,
		totals: { net: sum('net'), vat: sum('vat'), tot: sum('tot'), total: sum('total') }
	};
}

export type Invoice = Awaited<ReturnType<typeof invoiceFor>>;

/**
 * The invoice in the tax office's terms. ⚠ Provisional field names: check against the Ministry
 * of Revenues' e-invoicing specification and adjust here only.
 */
export function toProviderPayload(inv: Invoice) {
	return {
		invoiceType: inv.type === 'credit_note' ? 'CREDIT_NOTE' : 'INVOICE',
		invoiceNumber: inv.number,
		issueDate: inv.issueDate,
		currency: inv.currency,
		seller: { tin: inv.seller.tin, name: inv.seller.name, address: inv.seller.address },
		buyer: inv.buyer ? { tin: inv.buyer.tin, name: inv.buyer.name } : null,
		referenceIrn: inv.original?.irn ?? null,
		fiscalReceipt: inv.fiscal.fsNumber
			? { fsNo: inv.fiscal.fsNumber, mrc: inv.fiscal.machineCode }
			: null,
		items: inv.lines.map((l) => ({
			lineNo: l.no,
			code: l.sku,
			description: l.description,
			quantity: l.quantity,
			unit: l.unit,
			unitPrice: l.unitPrice,
			taxableAmount: l.net,
			vatRate: l.vatRate,
			vatAmount: l.vat,
			totRate: l.totRate,
			totAmount: l.tot,
			lineTotal: l.total
		})),
		totals: {
			taxableAmount: inv.totals.net,
			vatAmount: inv.totals.vat,
			totAmount: inv.totals.tot,
			totalAmount: inv.totals.total
		}
	};
}

/** What the invoice's QR code carries when the tax office sends none: enough to verify it. */
function qrData(inv: Invoice, irn: string) {
	return [irn, inv.seller.tin, inv.number, inv.issueDate, inv.totals.total.toFixed(2)].join('|');
}

async function token(settings: typeof organization.$inferSelect, secret: string) {
	if (!settings.einvoiceTokenUrl) return null;
	const res = await fetch(settings.einvoiceTokenUrl, {
		method: 'POST',
		headers: { 'content-type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({
			grant_type: 'client_credentials',
			client_id: settings.einvoiceClientId ?? '',
			client_secret: secret
		}),
		signal: AbortSignal.timeout(15_000)
	});
	const json = (await res.json().catch(() => ({}))) as { access_token?: string };
	if (!res.ok || !json.access_token) {
		throw new EinvoiceError(m.sales_einv_sign_in_failed({ status: res.status }));
	}
	return json.access_token;
}

/**
 * Sends a posted sale or customer return and keeps the IRN and QR data. Never throws for the
 * service's answer: failures are recorded on the document for a retry.
 */
export async function submitEinvoice(
	orgId: number,
	documentId: number,
	conn: Conn = db
): Promise<{ ok: true; irn: string } | { ok: false; error: string }> {
	const [org] = await conn.select().from(organization).where(eq(organization.id, orgId));
	if (!org?.einvoiceMode) return { ok: false, error: m.sales_einv_off() };

	let inv: Invoice;
	try {
		inv = await invoiceFor(orgId, documentId, conn);
	} catch (err) {
		return {
			ok: false,
			error: err instanceof Error ? err.message : m.sales_einv_build_failed()
		};
	}

	const record = (values: Partial<typeof stockDocument.$inferInsert>) =>
		conn.update(stockDocument).set(values).where(eq(stockDocument.id, documentId));

	try {
		let irn: string;
		let qr: string;
		let response: unknown;

		if (org.einvoiceMode === 'sandbox') {
			irn =
				'SBX-' +
				createHash('sha256')
					.update(
						`${inv.seller.tin}|${inv.type}|${inv.number}|${inv.issueDate}|${inv.totals.total}`
					)
					.digest('hex')
					.slice(0, 28)
					.toUpperCase();
			qr = qrData(inv, irn);
			response = { mode: 'sandbox', irn, receivedAt: new Date().toISOString() };
		} else {
			if (!org.einvoiceEndpoint) throw new EinvoiceError(m.sales_einv_set_endpoint());
			const secret = unseal(org.einvoiceSecret);
			if (!secret) throw new EinvoiceError(m.sales_einv_secret_again());
			const bearer = await token(org, secret);
			const res = await fetch(org.einvoiceEndpoint, {
				method: 'POST',
				headers: {
					'content-type': 'application/json',
					accept: 'application/json',
					authorization: bearer
						? `Bearer ${bearer}`
						: `Basic ${Buffer.from(`${org.einvoiceClientId ?? ''}:${secret}`).toString('base64')}`
				},
				body: JSON.stringify(toProviderPayload(inv)),
				signal: AbortSignal.timeout(20_000)
			});
			const text = await res.text();
			let json: Record<string, unknown> = {};
			try {
				json = text ? JSON.parse(text) : {};
			} catch {
				// kept as text below
			}
			response = Object.keys(json).length ? json : text;
			if (!res.ok) {
				await record({
					einvoiceStatus: res.status >= 400 && res.status < 500 ? 'rejected' : 'failed',
					einvoiceError: `${res.status}: ${String(json.message ?? json.error ?? text).slice(0, 200)}`,
					einvoiceResponse: typeof response === 'string' ? response : JSON.stringify(response)
				});
				return { ok: false, error: m.sales_einv_answered({ status: res.status }) };
			}
			irn = String(json.irn ?? json.IRN ?? json.invoiceReferenceNumber ?? '');
			if (!irn) throw new EinvoiceError(m.sales_einv_no_irn());
			qr = String(json.qr ?? json.qrCode ?? json.signedQRCode ?? qrData(inv, irn));
		}

		await record({
			einvoiceStatus: 'accepted',
			einvoiceIrn: irn,
			einvoiceQr: qr,
			einvoiceSubmittedAt: new Date(),
			einvoiceError: null,
			einvoiceResponse: typeof response === 'string' ? response : JSON.stringify(response)
		});
		return { ok: true, irn };
	} catch (err) {
		const error = err instanceof Error ? err.message : m.sales_einv_send_failed();
		await record({ einvoiceStatus: 'failed', einvoiceError: error.slice(0, 255) });
		return { ok: false, error };
	}
}
