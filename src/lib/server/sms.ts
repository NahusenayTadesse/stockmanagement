/**
 * Text messages, through GeezSMS — the same account and client as dana (`SMS_KEY`).
 *
 * Every business decides for itself (Admin panel → SMS): off until turned on, and each kind of
 * automatic message (sale receipts, payment confirmations, staff alerts) separately. Manual
 * messages — credit reminders, a proforma or order by SMS, a note — need `sms.send`.
 *
 * Like mail, nothing here throws: a text is a side effect of something that already happened,
 * and a provider being down must never undo a sale or fail a form. Every attempt is written to
 * `sms_message` with what came back, so "did they get it?" has an answer.
 *
 * `SMS_DRY_RUN=true` logs messages as `dry_run` without sending: for development, where the demo
 * customers carry realistic Ethiopian numbers that may belong to real people.
 *
 * Plain database code: no SvelteKit imports beyond `$env`, so the seed and cron can use it.
 */
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { env } from '$env/dynamic/private';
import { localToday } from '@nahu/admin-kit/time';
import { db } from '$lib/server/db';
import {
	approvalRequest,
	branch,
	customer,
	item,
	location,
	organization,
	purchaseOrder,
	purchaseOrderLine,
	quote,
	requisition,
	requisitionLine,
	smsMessage,
	stockDocument,
	stockDocumentLine,
	supplier,
	transactions,
	uom
} from '$lib/server/db/schema';
import { documentTotals } from '$lib/server/tax';
import { creditSummary, customerStatement } from '$lib/server/credit';
import { expiryWatch } from '$lib/server/expiry';
import { quoteLines } from '$lib/server/quotes';
import { formatEthPhone } from '$lib/phone';
import { m } from '$lib/paraglide/messages.js';
import { amountText, round4 } from '$lib/money';
import { ethiopianDay } from '$lib/format';

export { formatEthPhone };

const SMS_API_URL = 'https://api.geezsms.com/api/v1/sms/send';

/** GeezSMS rejects anything longer than this. */
export const SMS_LIMIT = 335;

type Status = (typeof smsMessage.$inferSelect)['status'];
export type SmsResult = { ok: boolean; status: Status | 'off'; error?: string };

// ── Numbers and text ──────────────────────────────────────────────────────────────────────

/**
 * Trims a message to the limit on a word boundary, with an ellipsis — a message that stops
 * mid-word looks broken; one ending in "…" was plainly shortened.
 */
export function capSms(text: string, limit = SMS_LIMIT) {
	if (text.length <= limit) return text;
	const clipped = text.slice(0, limit - 1);
	const boundary = Math.max(clipped.lastIndexOf(' '), clipped.lastIndexOf('\n'));
	return (boundary > limit - 40 ? clipped.slice(0, boundary) : clipped).trimEnd() + '…';
}

const birr = (n: number) => `${amountText(n)} ETB`;
const qty = (n: number) => String(round4(n));
const ethDate = ethiopianDay;
const origin = () => env.ORIGIN || '';

/**
 * The provider call, alone. `fetcher` is swapped in tests; nothing else should call this.
 * GeezSMS answers `{ error: false, msg, sms_units }` on success and `error: true` on failure.
 */
export async function deliver(
	phone: string,
	text: string,
	options: { fetcher?: typeof fetch; token?: string } = {}
): Promise<{ ok: boolean; error?: string; units?: number }> {
	const token = options.token ?? env.SMS_KEY;
	const fetcher = options.fetcher ?? fetch;
	if (!token) return { ok: false, error: m.sales_sms_err_no_key() };
	try {
		const body = new URLSearchParams({ token, phone, msg: text });
		const res = await fetcher(SMS_API_URL, {
			method: 'POST',
			body,
			signal: AbortSignal.timeout(15_000)
		});
		const data = (await res.json().catch(() => null)) as {
			error?: boolean;
			msg?: string;
			sms_units?: number | string;
			message_status?: string;
		} | null;
		if (res.status >= 400 || !data || data.error === true || data.message_status === 'failed') {
			return { ok: false, error: String(data?.msg ?? `The SMS provider answered ${res.status}`) };
		}
		const units = Number(data.sms_units);
		return { ok: true, units: Number.isFinite(units) ? units : undefined };
	} catch (err) {
		return {
			ok: false,
			error: err instanceof Error ? err.message : 'The SMS provider did not answer'
		};
	}
}

// ── Sending ───────────────────────────────────────────────────────────────────────────────

type Conn = Pick<typeof db, 'select' | 'insert'>;

export async function smsSettings(orgId: number, conn: Conn = db) {
	const [org] = await conn
		.select({
			name: organization.name,
			phone: organization.phone,
			enabled: organization.smsEnabled,
			sales: organization.smsSales,
			payments: organization.smsPayments,
			alertPhones: organization.smsAlertPhones,
			signature: organization.smsSignature
		})
		.from(organization)
		.where(eq(organization.id, orgId));
	return org ?? null;
}

type SendInput = {
	/** The number as typed anywhere; normalised here. */
	to: string | null | undefined;
	text: string;
	kind: string;
	customerId?: number | null;
	supplierId?: number | null;
	link?: string | null;
	userId?: string | null;
};

/**
 * Sends one message, signed with the business's name, and logs it. Nothing is sent or logged
 * while the business has SMS off (`status: 'off'`). A bad number is logged as skipped.
 */
export async function sendSms(
	orgId: number,
	input: SendInput,
	/** Tests only: their transaction, a stand-in provider, and whether to send at all. */
	options: { conn?: Conn; fetcher?: typeof fetch; token?: string; dryRun?: boolean } = {}
): Promise<SmsResult> {
	const conn = options.conn ?? db;
	const settings = await smsSettings(orgId, conn);
	if (!settings?.enabled) return { ok: false, status: 'off', error: m.sales_sms_err_off() };

	const body = capSms(`${settings.signature || settings.name}: ${input.text.trim()}`);
	const number = formatEthPhone(input.to);
	let status: Status;
	let error: string | undefined;
	let units: number | undefined;
	if ('error' in number) {
		status = 'skipped';
		error = number.error;
	} else if (options.dryRun ?? env.SMS_DRY_RUN === 'true') {
		status = 'dry_run';
	} else {
		const r = await deliver(number.phone, body, options);
		status = r.ok ? 'sent' : 'failed';
		error = r.error;
		units = r.units;
	}
	if (status === 'failed') console.error(`[sms] to ${input.to} failed:`, error);

	try {
		await conn.insert(smsMessage).values({
			orgId,
			phone: 'phone' in number ? number.phone : String(input.to ?? '').slice(0, 20),
			body,
			kind: input.kind,
			status,
			error: error?.slice(0, 255) ?? null,
			units: units ?? null,
			customerId: input.customerId ?? null,
			supplierId: input.supplierId ?? null,
			link: input.link ?? null,
			createdBy: input.userId ?? null
		});
	} catch (err) {
		console.error('[sms] could not log a message:', err);
	}
	return { ok: status === 'sent' || status === 'dry_run', status, error };
}

/** The business's staff alert numbers, one message each. Returns how many went. */
export async function alertStaff(
	orgId: number,
	text: string,
	extra: { kind?: string; link?: string | null; also?: (string | null | undefined)[] } = {}
) {
	const settings = await smsSettings(orgId);
	if (!settings?.enabled) return 0;
	const numbers = new Set<string>();
	for (const raw of [...(settings.alertPhones ?? '').split(/[,;\n]/), ...(extra.also ?? [])]) {
		const f = formatEthPhone(raw);
		if ('phone' in f) numbers.add(f.phone);
	}
	let sent = 0;
	for (const phone of numbers) {
		const r = await sendSms(orgId, {
			to: phone,
			text,
			kind: extra.kind ?? 'alert',
			link: extra.link
		});
		if (r.ok) sent++;
	}
	return sent;
}

// ── Automatic messages ────────────────────────────────────────────────────────────────────

/**
 * After a sale is posted: a receipt to the customer — to a named customer with a mobile when the
 * business texts receipts, or to the number the cashier typed (`to`), which is always honoured.
 */
export async function smsSaleReceipt(
	orgId: number,
	documentId: number,
	options: { to?: string | null; userId?: string | null } = {}
): Promise<SmsResult | null> {
	const settings = await smsSettings(orgId);
	if (!settings?.enabled) return null;
	const [doc] = await db
		.select({
			id: stockDocument.id,
			type: stockDocument.type,
			number: stockDocument.number,
			customerId: stockDocument.customerId,
			customerPhone: customer.phone,
			fs: stockDocument.fiscalReceiptNumber
		})
		.from(stockDocument)
		.leftJoin(customer, eq(customer.id, stockDocument.customerId))
		.where(and(eq(stockDocument.id, documentId), eq(stockDocument.orgId, orgId)));
	if (!doc || doc.type !== 'issue') return null;
	const to = options.to || (settings.sales ? doc.customerPhone : null);
	if (!to) return null;

	const totals = await documentTotals(orgId, doc.id);
	if (!totals || totals.gross <= 0) return null;
	const [paid] = await db
		.select({ amount: sql<number>`COALESCE(SUM(${transactions.amount}), 0)` })
		.from(transactions)
		.where(
			and(
				eq(transactions.documentId, doc.id),
				eq(transactions.direction, 'in'),
				sql`${transactions.status} <> 'void'`,
				isNull(transactions.deletedAt)
			)
		);
	const lineCount = await db
		.select({ n: sql<number>`COUNT(*)` })
		.from(stockDocumentLine)
		.where(and(eq(stockDocumentLine.documentId, doc.id), isNull(stockDocumentLine.deletedAt)));
	const tax = totals.vat ? ' incl. VAT' : totals.tot ? ' incl. TOT' : '';
	const parts = [
		`Thank you. Receipt ${doc.number}: ${Number(lineCount[0].n)} item(s), ${birr(totals.gross)}${tax}.`,
		`Paid ${birr(Number(paid.amount))}.`
	];
	if (doc.fs) parts.push(`FS No ${doc.fs}.`);
	if (doc.customerId) {
		const position = await customerStatement(orgId, doc.customerId);
		if (position.balance > 0.004) parts.push(`You owe ${birr(position.balance)} in all.`);
	}
	return sendSms(orgId, {
		to,
		text: parts.join(' '),
		kind: 'sale',
		customerId: doc.customerId,
		link: `/dashboard/stock/documents/${doc.id}`,
		userId: options.userId
	});
}

/** After money from a customer is recorded: what was received, and what they still owe. */
export async function smsPaymentReceived(
	orgId: number,
	transactionId: number,
	userId?: string | null
): Promise<SmsResult | null> {
	const settings = await smsSettings(orgId);
	if (!settings?.enabled || !settings.payments) return null;
	const [t] = await db
		.select({
			amount: transactions.amount,
			withheld: transactions.withheld,
			direction: transactions.direction,
			customerId: transactions.customerId,
			phone: customer.phone,
			reference: transactions.reference
		})
		.from(transactions)
		.innerJoin(customer, eq(customer.id, transactions.customerId))
		.where(and(eq(transactions.id, transactionId), eq(transactions.orgId, orgId)));
	if (!t || t.direction !== 'in' || !t.phone) return null;
	const position = await customerStatement(orgId, t.customerId!);
	const text = [
		`We received ${birr(t.amount)}${t.reference ? ` (ref ${t.reference})` : ''}${t.withheld ? ` and ${birr(t.withheld)} withheld tax` : ''}. Thank you.`,
		position.balance > 0.004
			? `You still owe ${birr(position.balance)}.`
			: 'Your account is fully paid.'
	].join(' ');
	return sendSms(orgId, {
		to: t.phone,
		text,
		kind: 'payment',
		customerId: t.customerId,
		link: `/dashboard/transactions/${transactionId}`,
		userId
	});
}

/** A request for approval was made: tell the approvers' phones. */
export async function smsApprovalWaiting(orgId: number, requestId: number) {
	const [r] = await db
		.select({
			kind: approvalRequest.kind,
			value: approvalRequest.value,
			reason: approvalRequest.reason,
			documentId: approvalRequest.documentId,
			countId: approvalRequest.countId,
			purchaseOrderId: approvalRequest.purchaseOrderId
		})
		.from(approvalRequest)
		.where(and(eq(approvalRequest.id, requestId), eq(approvalRequest.orgId, orgId)));
	if (!r) return 0;
	const what =
		r.kind === 'adjustment'
			? `Adjustment #${r.documentId}`
			: r.kind === 'count'
				? `Stock count #${r.countId}`
				: `Purchase order #${r.purchaseOrderId}`;
	return alertStaff(
		orgId,
		`Approval waiting: ${what}, ${birr(r.value)}. ${origin()}/dashboard/approvals`,
		{ kind: 'alert', link: '/dashboard/approvals' }
	);
}

/** A transfer is on its way to another branch: tell that branch (its phone) and the alert list. */
export async function smsTransferDispatched(orgId: number, documentId: number) {
	const [doc] = await db
		.select({
			number: stockDocument.number,
			driver: stockDocument.driverName,
			plate: stockDocument.vehiclePlate,
			to: location.name,
			branchPhone: branch.phone
		})
		.from(stockDocument)
		.innerJoin(location, eq(location.id, stockDocument.toLocationId))
		.innerJoin(branch, eq(branch.id, location.branchId))
		.where(and(eq(stockDocument.id, documentId), eq(stockDocument.orgId, orgId)));
	if (!doc) return 0;
	const lines = await db
		.select({ name: item.name, quantity: stockDocumentLine.quantity, unit: uom.symbol })
		.from(stockDocumentLine)
		.innerJoin(item, eq(item.id, stockDocumentLine.itemId))
		.innerJoin(uom, eq(uom.id, stockDocumentLine.uomId))
		.where(and(eq(stockDocumentLine.documentId, documentId), isNull(stockDocumentLine.deletedAt)));
	const listed = lines
		.slice(0, 4)
		.map((l) => `${qty(l.quantity)} ${l.unit} ${l.name}`)
		.join(', ');
	const carrier = [doc.driver, doc.plate].filter(Boolean).join(' ');
	return alertStaff(
		orgId,
		`Transfer ${doc.number} on the way to ${doc.to}: ${listed}${lines.length > 4 ? ` +${lines.length - 4} more` : ''}.${carrier ? ` Carried by ${carrier}.` : ''} Receive it when it arrives.`,
		{ kind: 'transfer', link: `/dashboard/stock/documents/${documentId}`, also: [doc.branchPhone] }
	);
}

/** A department submitted a requisition: tell the alert list. */
export async function smsRequisitionSubmitted(orgId: number, requisitionId: number) {
	const [r] = await db
		.select({
			number: requisition.number,
			department: requisition.department,
			neededBy: requisition.neededBy
		})
		.from(requisition)
		.where(and(eq(requisition.id, requisitionId), eq(requisition.orgId, orgId)));
	if (!r) return 0;
	const [{ n }] = await db
		.select({ n: sql<number>`COUNT(*)` })
		.from(requisitionLine)
		.where(
			and(eq(requisitionLine.requisitionId, requisitionId), isNull(requisitionLine.deletedAt))
		);
	return alertStaff(
		orgId,
		`Requisition ${r.number} from ${r.department}: ${Number(n)} item(s)${r.neededBy ? `, needed by ${ethDate(r.neededBy)}` : ''}. ${origin()}/dashboard/requisitions/${requisitionId}`,
		{ kind: 'alert', link: `/dashboard/requisitions/${requisitionId}` }
	);
}

/**
 * The morning digest for each business with SMS and alert numbers: what expired or is expiring,
 * how much is overdue, what waits for approval. Nothing is sent when there is nothing to say.
 */
export async function sendSmsDigests(today = localToday()) {
	const orgs = await db
		.select({ id: organization.id })
		.from(organization)
		.where(
			and(
				eq(organization.isActive, true),
				eq(organization.smsEnabled, true),
				sql`${organization.smsAlertPhones} IS NOT NULL AND ${organization.smsAlertPhones} <> ''`
			)
		);
	let sent = 0;
	for (const { id } of orgs) {
		const [watch, credit, [pending]] = await Promise.all([
			expiryWatch(id, today),
			creditSummary(id, today),
			db
				.select({ n: sql<number>`COUNT(*)` })
				.from(approvalRequest)
				.where(and(eq(approvalRequest.orgId, id), eq(approvalRequest.status, 'pending')))
		]);
		const out = watch.filter((w) => w.locationKind !== 'quarantine');
		const expired = out.filter((w) => w.band === 'expired').length;
		const soon = out.filter((w) => w.band === 'soon').length;
		const overdue = credit.reduce((s, c) => s + c.overdue, 0);
		const late = credit.filter((c) => c.overdue > 0).length;
		const parts = [
			expired && `${expired} lot(s) expired on the shelf`,
			soon && `${soon} expiring soon`,
			overdue > 0 && `${birr(overdue)} overdue from ${late} customer(s)`,
			Number(pending.n) && `${Number(pending.n)} waiting for approval`
		].filter(Boolean);
		if (!parts.length) continue;
		sent += await alertStaff(id, `Today: ${parts.join('; ')}. ${origin()}/dashboard`, {
			kind: 'digest',
			link: '/dashboard'
		});
	}
	return sent;
}

// ── Messages someone chooses to send ──────────────────────────────────────────────────────

/** A reminder of what a customer owes, and how much of it is late. */
export async function remindCustomer(
	orgId: number,
	customerId: number,
	options: { userId?: string | null; to?: string | null } = {}
): Promise<SmsResult> {
	const settings = await smsSettings(orgId);
	const [c] = await db
		.select({ name: customer.name, phone: customer.phone })
		.from(customer)
		.where(and(eq(customer.id, customerId), eq(customer.orgId, orgId)));
	if (!c) return { ok: false, status: 'skipped', error: m.sales_sms_err_no_customer() };
	const position = await customerStatement(orgId, customerId);
	if (position.balance <= 0.004) {
		return { ok: false, status: 'skipped', error: m.sales_sms_err_owes_nothing({ name: c.name }) };
	}
	const text = [
		`Dear ${c.name}, your account stands at ${birr(position.balance)}`,
		position.overdue > 0
			? `, of which ${birr(position.overdue)} is overdue (the oldest by ${position.oldestOverdueDays} days). Please pay at your earliest.`
			: '. Thank you for your business.',
		settings?.phone ? ` Questions: ${settings.phone}.` : ''
	].join('');
	return sendSms(orgId, {
		to: options.to || c.phone,
		text,
		kind: 'reminder',
		customerId,
		link: `/dashboard/customers/${customerId}`,
		userId: options.userId
	});
}

/** Reminders to every customer with something overdue and a mobile number. */
export async function remindOverdue(orgId: number, userId?: string | null) {
	const late = (await creditSummary(orgId)).filter((c) => c.isActive && c.overdue > 0);
	let sent = 0;
	let skipped = 0;
	for (const c of late) {
		const r = await remindCustomer(orgId, c.id, { userId });
		if (r.ok) sent++;
		else skipped++;
		if (r.status === 'off') break;
	}
	return { sent, skipped, overdue: late.length };
}

/** A proforma's summary: what, how much, until when. */
export async function smsQuote(
	orgId: number,
	quoteId: number,
	input: { to?: string | null; userId?: string | null }
): Promise<SmsResult> {
	const [q] = await db
		.select({
			number: quote.number,
			validUntil: quote.validUntil,
			customerId: quote.customerId,
			phone: sql<string | null>`COALESCE(${customer.phone}, ${quote.buyerPhone})`
		})
		.from(quote)
		.leftJoin(customer, eq(customer.id, quote.customerId))
		.where(and(eq(quote.id, quoteId), eq(quote.orgId, orgId)));
	if (!q) return { ok: false, status: 'skipped', error: m.sales_sms_err_no_quote() };
	const { lines, totals } = await quoteLines(orgId, quoteId);
	const listed = lines
		.slice(0, 3)
		.map((l) => `${l.item} x${qty(l.quantity)}`)
		.join(', ');
	const tax = totals.vat ? ' incl. VAT' : totals.tot ? ' incl. TOT' : '';
	const text = `Proforma ${q.number ?? `#${quoteId}`}: ${listed}${lines.length > 3 ? ` +${lines.length - 3} more` : ''}. Total ${birr(totals.gross)}${tax}${q.validUntil ? `, valid until ${ethDate(q.validUntil)}` : ''}.`;
	return sendSms(orgId, {
		to: input.to || q.phone,
		text,
		kind: 'quote',
		customerId: q.customerId,
		link: `/dashboard/sales/quotes/${quoteId}`,
		userId: input.userId
	});
}

/** A purchase order, short enough for a text: what, how many, where, by when. */
export async function smsOrder(
	orgId: number,
	orderId: number,
	input: { to?: string | null; userId?: string | null }
): Promise<SmsResult> {
	const [o] = await db
		.select({
			number: purchaseOrder.number,
			expectedDate: purchaseOrder.expectedDate,
			supplierId: purchaseOrder.supplierId,
			phone: supplier.phone,
			deliverTo: location.name
		})
		.from(purchaseOrder)
		.innerJoin(supplier, eq(supplier.id, purchaseOrder.supplierId))
		.innerJoin(location, eq(location.id, purchaseOrder.locationId))
		.where(and(eq(purchaseOrder.id, orderId), eq(purchaseOrder.orgId, orgId)));
	if (!o) return { ok: false, status: 'skipped', error: m.sales_sms_err_no_order() };
	if (!o.number) return { ok: false, status: 'skipped', error: m.sales_sms_err_order_first() };
	const lines = await db
		.select({ name: item.name, quantity: purchaseOrderLine.quantity, unit: uom.symbol })
		.from(purchaseOrderLine)
		.innerJoin(item, eq(item.id, purchaseOrderLine.itemId))
		.innerJoin(uom, eq(uom.id, purchaseOrderLine.uomId))
		.where(
			and(eq(purchaseOrderLine.purchaseOrderId, orderId), isNull(purchaseOrderLine.deletedAt))
		);
	const listed = lines
		.slice(0, 5)
		.map((l) => `${qty(l.quantity)} ${l.unit} ${l.name}`)
		.join('; ');
	const text = `Order ${o.number}: ${listed}${lines.length > 5 ? `; +${lines.length - 5} more` : ''}. Deliver to ${o.deliverTo}${o.expectedDate ? ` by ${ethDate(o.expectedDate)}` : ''}. Please confirm.`;
	return sendSms(orgId, {
		to: input.to || o.phone,
		text,
		kind: 'order',
		supplierId: o.supplierId,
		link: `/dashboard/purchasing/${orderId}`,
		userId: input.userId
	});
}

/** The latest messages, for the SMS page (or one customer's). */
export async function smsLog(
	orgId: number,
	filter: { customerId?: number; supplierId?: number } = {}
) {
	return db
		.select({
			id: smsMessage.id,
			createdAt: smsMessage.createdAt,
			phone: smsMessage.phone,
			kind: smsMessage.kind,
			status: smsMessage.status,
			body: smsMessage.body,
			error: smsMessage.error,
			units: smsMessage.units,
			link: smsMessage.link,
			customerId: smsMessage.customerId,
			customer: customer.name,
			supplier: supplier.name
		})
		.from(smsMessage)
		.leftJoin(customer, eq(customer.id, smsMessage.customerId))
		.leftJoin(supplier, eq(supplier.id, smsMessage.supplierId))
		.where(
			and(
				eq(smsMessage.orgId, orgId),
				filter.customerId ? eq(smsMessage.customerId, filter.customerId) : undefined,
				filter.supplierId ? eq(smsMessage.supplierId, filter.supplierId) : undefined
			)
		)
		.orderBy(desc(smsMessage.id))
		.limit(filter.customerId || filter.supplierId ? 20 : 500);
}
