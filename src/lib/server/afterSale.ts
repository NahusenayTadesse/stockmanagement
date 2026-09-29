/**
 * What happens to a sale once it is posted and committed: the fiscal receipt, when the branch's
 * device prints on posting, and the e-invoice, when the business has e-invoicing on. Both are
 * optional and both run after the commit — a failure is kept on the sale for a retry and never
 * undoes it. Then the SMS receipt, when the business texts receipts (or the cashier typed a
 * number for it). Returns a line for the person who posted.
 */
import { and, eq, isNotNull } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { organization, stockDocument, stockDocumentLine } from '$lib/server/db/schema';
import { deviceFor, printFiscal } from '$lib/server/fiscal';
import { submitEinvoice } from '$lib/server/einvoice';
import { smsSaleReceipt, type SmsResult } from '$lib/server/sms';
import { m } from '$lib/paraglide/messages.js';

/** A line for the person who did it: "SMS sent to 2519…", or why not. Null when SMS is off. */
export function smsNote(r: SmsResult, to: string) {
	if (r.status === 'off') return null;
	if (r.status === 'sent') return m.sales_sms_sent_to({ to });
	if (r.status === 'dry_run') return m.sales_sms_logged_for({ to });
	return m.sales_sms_not_sent_to({ to, error: r.error ?? m.sales_unknown_error() });
}

export async function afterSale(
	orgId: number,
	documentId: number,
	options: { smsTo?: string | null; userId?: string | null } = {}
): Promise<{ notes: string[]; failed: boolean }> {
	const [doc] = await db
		.select({ type: stockDocument.type, branchId: stockDocument.branchId })
		.from(stockDocument)
		.where(and(eq(stockDocument.id, documentId), eq(stockDocument.orgId, orgId)));
	if (!doc || (doc.type !== 'issue' && doc.type !== 'sales_return'))
		return { notes: [], failed: false };

	// Only a priced sale is a sale for tax: an internal issue has no receipt and no invoice.
	const [priced] = await db
		.select({ id: stockDocumentLine.id })
		.from(stockDocumentLine)
		.where(
			and(eq(stockDocumentLine.documentId, documentId), isNotNull(stockDocumentLine.unitPrice))
		)
		.limit(1);
	if (!priced) return { notes: [], failed: false };

	const notes: string[] = [];
	let failed = false;
	const device = await deviceFor(orgId, doc.branchId);
	if (device?.autoPrint) {
		const r = await printFiscal(orgId, documentId, device.id);
		failed ||= !r.ok;
		notes.push(
			r.ok
				? r.fsNumber
					? m.sales_fiscal_printed({ number: r.fsNumber })
					: m.sales_fiscal_ring_up()
				: m.sales_fiscal_not_printed({ error: r.error })
		);
	}
	const [org] = await db
		.select({ mode: organization.einvoiceMode })
		.from(organization)
		.where(eq(organization.id, orgId));
	if (org?.mode) {
		const r = await submitEinvoice(orgId, documentId);
		failed ||= !r.ok;
		notes.push(
			r.ok ? m.sales_einvoice_irn({ irn: r.irn }) : m.sales_einvoice_not_sent({ error: r.error })
		);
	}
	// Last, so the text can carry the FS No.
	const sms = await smsSaleReceipt(orgId, documentId, {
		to: options.smsTo,
		userId: options.userId
	});
	const note = sms && smsNote(sms, options.smsTo || m.sales_the_customer());
	if (note) notes.push(note);
	return { notes, failed };
}
