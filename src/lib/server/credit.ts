/**
 * Customer credit (ዱቤ): what each customer owes, how long it has been owed, and whether a new sale
 * fits their limit.
 *
 * What a customer owes is worked out, never stored:
 *
 *   owed = posted sales to them, at the price on each line, VAT included
 *        − goods they returned (at what they were charged)
 *        − money in from them, and tax they withheld from it
 *        + refunds paid out to them                               (voided transactions ignored)
 *
 * A cash sale is simply a sale whose payment is recorded with it, so it nets to nothing. Payments
 * are applied to the oldest sales first; whatever is left of a sale is open, and due `creditDays`
 * after the sale.
 *
 * Imported by the posting service, so this file sticks to the database and plain helpers — no
 * form or Vite-only code.
 */
import { m } from '$lib/paraglide/messages.js';
import { and, asc, eq, inArray, isNotNull, isNull, ne, sql } from 'drizzle-orm';
import { addLocalDays, localToday } from '@nahu/admin-kit/time';
import { db } from '$lib/server/db';
import { customer, stockDocument, stockDocumentLine, transactions } from '$lib/server/db/schema';
import { lineAmounts, lineNetSql, lineTotSql, lineVatSql } from '$lib/server/tax';

type Reader = Pick<typeof db, 'select'>;

const cents = (n: number) => Math.round(n * 100) / 100;

/** A sale's value: every line at its price, in the line's own unit, VAT and TOT included. */
export const lineValueSql = sql<number>`COALESCE(SUM(${lineNetSql} + ${lineVatSql} + ${lineTotSql}), 0)`;

export type Bucket = 'current' | 'd1_30' | 'd31_60' | 'd61_90' | 'd90_plus';
/** A bucket whose label is read in the viewer's language when it is read. */
const bucket = (key: Bucket, label: () => string) => ({
	key,
	get label() {
		return label();
	}
});

export const BUCKETS: { key: Bucket; label: string }[] = [
	bucket('current', m.sales_bucket_current),
	bucket('d1_30', m.sales_bucket_d1_30),
	bucket('d31_60', m.sales_bucket_d31_60),
	bucket('d61_90', m.sales_bucket_d61_90),
	bucket('d90_plus', m.sales_bucket_d90_plus)
];

function bucketOf(daysOverdue: number): Bucket {
	if (daysOverdue <= 0) return 'current';
	if (daysOverdue <= 30) return 'd1_30';
	if (daysOverdue <= 60) return 'd31_60';
	if (daysOverdue <= 90) return 'd61_90';
	return 'd90_plus';
}

const daysBetween = (from: string, to: string) =>
	Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

/** Posted sales, customer returns and live payments of the given customers (or all of them). */
async function rawLedger(orgId: number, customerIds: number[] | null, reader: Reader) {
	const docs = await reader
		.select({
			customerId: stockDocument.customerId,
			type: stockDocument.type,
			id: stockDocument.id,
			number: stockDocument.number,
			docDate: stockDocument.docDate,
			reference: stockDocument.reference,
			value: lineValueSql
		})
		.from(stockDocument)
		.innerJoin(stockDocumentLine, eq(stockDocumentLine.documentId, stockDocument.id))
		.where(
			and(
				eq(stockDocument.orgId, orgId),
				inArray(stockDocument.type, ['issue', 'sales_return']),
				eq(stockDocument.status, 'posted'),
				isNotNull(stockDocument.customerId),
				customerIds ? inArray(stockDocument.customerId, customerIds) : undefined,
				isNull(stockDocumentLine.deletedAt)
			)
		)
		.groupBy(stockDocument.id)
		.orderBy(asc(stockDocument.docDate), asc(stockDocument.id));

	const payments = await reader
		.select({
			customerId: transactions.customerId,
			id: transactions.id,
			occurredOn: transactions.occurredOn,
			direction: transactions.direction,
			amount: transactions.amount,
			withheld: transactions.withheld,
			withholdingReceipt: transactions.withholdingReceipt,
			reference: transactions.reference,
			receiptNumber: transactions.receiptNumber
		})
		.from(transactions)
		.where(
			and(
				eq(transactions.orgId, orgId),
				isNotNull(transactions.customerId),
				customerIds ? inArray(transactions.customerId, customerIds) : undefined,
				ne(transactions.status, 'void'),
				isNull(transactions.deletedAt)
			)
		)
		.orderBy(asc(transactions.occurredOn), asc(transactions.id));

	const all = docs.map((d) => ({ ...d, customerId: d.customerId!, value: cents(Number(d.value)) }));
	return {
		sales: all.filter((d) => d.type === 'issue'),
		returns: all.filter((d) => d.type === 'sales_return'),
		payments: payments.map((p) => ({ ...p, customerId: p.customerId! }))
	};
}

type Ledger = Awaited<ReturnType<typeof rawLedger>>;
type Sale = Ledger['sales'][number];

function forCustomer(ledger: Ledger, customerId: number): Ledger {
	return {
		sales: ledger.sales.filter((x) => x.customerId === customerId),
		returns: ledger.returns.filter((x) => x.customerId === customerId),
		payments: ledger.payments.filter((x) => x.customerId === customerId)
	};
}

/**
 * One customer's position: balance, the sales still open, and how overdue they are. Money paid,
 * tax they withheld, and goods they returned all settle the account; a refund reopens it.
 */
function position(
	ledger: Ledger,
	terms: { creditDays: number; creditLimit: number | null },
	today: string
) {
	const sales = ledger.sales;
	const sold = sales.reduce((s, x) => s + x.value, 0);
	const returned = ledger.returns.reduce((s, x) => s + x.value, 0);
	const paidIn = ledger.payments
		.filter((p) => p.direction === 'in')
		.reduce((s, p) => s + p.amount + p.withheld, 0);
	const withheld = ledger.payments
		.filter((p) => p.direction === 'in')
		.reduce((s, p) => s + p.withheld, 0);
	const refunded = ledger.payments
		.filter((p) => p.direction === 'out')
		.reduce((s, p) => s + p.amount, 0);
	const credits = paidIn - refunded + returned;
	const balance = cents(sold - credits);

	// Oldest sales are settled first.
	let left = credits;
	const open: (Sale & {
		remaining: number;
		dueDate: string;
		daysOverdue: number;
		bucket: Bucket;
	})[] = [];
	for (const s of sales) {
		const applied = Math.max(0, Math.min(s.value, left));
		left -= applied;
		const remaining = cents(s.value - applied);
		if (remaining <= 0) continue;
		const dueDate = addLocalDays(s.docDate, terms.creditDays);
		const daysOverdue = daysBetween(dueDate, today);
		open.push({ ...s, remaining, dueDate, daysOverdue, bucket: bucketOf(daysOverdue) });
	}

	const buckets = Object.fromEntries(BUCKETS.map((b) => [b.key, 0])) as Record<Bucket, number>;
	for (const o of open) buckets[o.bucket] = cents(buckets[o.bucket] + o.remaining);
	const overdue = cents(open.filter((o) => o.daysOverdue > 0).reduce((s, o) => s + o.remaining, 0));

	return {
		sold: cents(sold),
		returned: cents(returned),
		paid: cents(paidIn - refunded),
		withheld: cents(withheld),
		balance,
		overdue,
		oldestOverdueDays: open.reduce((m, o) => Math.max(m, o.daysOverdue), 0),
		open,
		buckets,
		creditLimit: terms.creditLimit,
		creditDays: terms.creditDays,
		available: terms.creditLimit === null ? null : cents(terms.creditLimit - balance),
		overLimit: terms.creditLimit !== null && balance > terms.creditLimit + 0.004
	};
}

/** Every customer's position, for the customer list and the ageing page. */
export async function creditSummary(orgId: number, today = localToday(), reader: Reader = db) {
	const [customers, ledger] = await Promise.all([
		reader
			.select({
				id: customer.id,
				name: customer.name,
				phone: customer.phone,
				isActive: customer.isActive,
				creditLimit: customer.creditLimit,
				creditDays: customer.creditDays
			})
			.from(customer)
			.where(and(eq(customer.orgId, orgId), isNull(customer.deletedAt)))
			.orderBy(asc(customer.name)),
		rawLedger(orgId, null, reader)
	]);

	return customers.map((c) => ({
		id: c.id,
		name: c.name,
		phone: c.phone,
		isActive: c.isActive,
		...position(forCustomer(ledger, c.id), c, today)
	}));
}

/**
 * One customer's statement: every sale and payment in date order with a running balance, plus
 * their position. `from` limits the lines shown; the balance brought forward covers the rest.
 */
export async function customerStatement(
	orgId: number,
	customerId: number,
	opts: { today?: string; from?: string } = {},
	reader: Reader = db
) {
	const today = opts.today ?? localToday();
	const [[c], ledger] = await Promise.all([
		reader
			.select({ creditLimit: customer.creditLimit, creditDays: customer.creditDays })
			.from(customer)
			.where(and(eq(customer.id, customerId), eq(customer.orgId, orgId))),
		rawLedger(orgId, [customerId], reader)
	]);

	type Entry = {
		kind: 'sale' | 'return' | 'payment' | 'withholding' | 'refund';
		/** The document or transaction behind it. */
		id: number;
		date: string;
		label: string;
		reference: string | null;
		debit: number;
		credit: number;
	};
	const entries: Entry[] = [
		...ledger.sales.map((s) => ({
			kind: 'sale' as const,
			id: s.id,
			date: s.docDate,
			label: s.number ?? `#${s.id}`,
			reference: s.reference,
			debit: s.value,
			credit: 0
		})),
		...ledger.returns.map((r) => ({
			kind: 'return' as const,
			id: r.id,
			date: r.docDate,
			label: m.sales_goods_returned({ number: r.number ?? `#${r.id}` }),
			reference: r.reference,
			debit: 0,
			credit: r.value
		})),
		...ledger.payments.flatMap((p) => [
			{
				kind: p.direction === 'in' ? ('payment' as const) : ('refund' as const),
				id: p.id,
				date: p.occurredOn,
				label: p.direction === 'in' ? m.sales_payment_received() : m.sales_refund_paid(),
				reference: p.reference ?? p.receiptNumber,
				debit: p.direction === 'out' ? p.amount : 0,
				credit: p.direction === 'in' ? p.amount : 0
			},
			...(p.direction === 'in' && p.withheld > 0
				? [
						{
							kind: 'withholding' as const,
							id: p.id,
							date: p.occurredOn,
							label: m.sales_tax_withheld_by_you(),
							reference: p.withholdingReceipt,
							debit: 0,
							credit: p.withheld
						}
					]
				: [])
		])
	].sort(
		(a, b) => a.date.localeCompare(b.date) || (a.kind === 'sale' ? -1 : b.kind === 'sale' ? 1 : 0)
	);

	let running = 0;
	let broughtForward = 0;
	const lines: ((typeof entries)[number] & { balance: number })[] = [];
	for (const e of entries) {
		running = cents(running + e.debit - e.credit);
		if (opts.from && e.date < opts.from) broughtForward = running;
		else lines.push({ ...e, balance: running });
	}

	return {
		broughtForward,
		lines,
		...position(ledger, c ?? { creditLimit: null, creditDays: 30 }, today)
	};
}

/**
 * Before a sale to a named customer is posted: every line must carry a price (it is what they
 * owe), and the sale must fit their credit limit — counting every payment already recorded,
 * including one recorded on this very sale. Returns the refusal, or null.
 */
export async function creditCheck(
	reader: Reader,
	input: { orgId: number; documentId: number; customerId: number; allowOverLimit: boolean }
): Promise<string | null> {
	const [c] = await reader
		.select({
			name: customer.name,
			creditLimit: customer.creditLimit,
			creditDays: customer.creditDays
		})
		.from(customer)
		.where(
			and(
				eq(customer.id, input.customerId),
				eq(customer.orgId, input.orgId),
				isNull(customer.deletedAt)
			)
		);
	if (!c) return m.sales_credit_customer_gone();

	const lines = await reader
		.select({
			unitPrice: stockDocumentLine.unitPrice,
			quantity: stockDocumentLine.quantity,
			vatRate: stockDocumentLine.vatRate,
			totRate: stockDocumentLine.totRate
		})
		.from(stockDocumentLine)
		.where(
			and(eq(stockDocumentLine.documentId, input.documentId), isNull(stockDocumentLine.deletedAt))
		);
	const unpriced = lines.filter((l) => l.unitPrice === null).length;
	if (unpriced) {
		return m.sales_credit_unpriced({
			name: c.name,
			count: unpriced,
			count_word: unpriced === 1 ? m.sales_has() : m.sales_have()
		});
	}
	if (c.creditLimit === null || input.allowOverLimit) return null;

	const ledger = await rawLedger(input.orgId, [input.customerId], reader);
	const now = position(ledger, c, localToday()).balance;
	// VAT included: posting has fixed each line's rate before asking.
	const sale = cents(
		lines.reduce((s, l) => s + lineAmounts(l.quantity, l.unitPrice, l.vatRate, l.totRate).gross, 0)
	);
	const after = cents(now + sale);
	if (after <= c.creditLimit + 0.004) return null;

	const etb = (n: number) =>
		`ETB ${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
	return c.creditLimit === 0
		? m.sales_credit_cash_only({ name: c.name, amount: etb(after) })
		: m.sales_credit_over_limit({ name: c.name, amount: etb(after), limit: etb(c.creditLimit) });
}
