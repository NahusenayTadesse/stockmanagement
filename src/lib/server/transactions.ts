/**
 * Money: recording it, checking it, listing it. Every query is filtered by the business first.
 */

import { ownsReceipt } from '$lib/server/billing/payments';
import { and, asc, desc, eq, gte, isNull, lte, ne, or, sql, type SQL } from 'drizzle-orm';
import { m } from '$lib/paraglide/messages.js';
import { WriteRefused } from '@nahu/admin-kit/server/childCrud';
import { saveUploadedFile } from '@nahu/admin-kit/server/files';
import { addLocalDays } from '@nahu/admin-kit/time';
import { ethiopianRange, getEthiopianYearMonth } from '@nahu/admin-kit/global';
import { db } from '$lib/server/db';
import { qualified } from '$lib/server/db/sql';
import {
	branch,
	customer,
	item,
	organization,
	paymentMethod,
	stockDocument,
	stockDocumentLine,
	supplier,
	transactionAttachment,
	transactions,
	user
} from '$lib/server/db/schema';
import { ethiopianFiscalYear } from '$lib/server/stock/math';
import { TRANSACTION_DIRECTIONS, TRANSACTION_PURPOSES, TRANSACTION_STATUSES } from '$lib/constants';
import type { Tx } from '$lib/server/stock/post';
import { cents, round4 } from '$lib/money';
import { factorIn, packsOf } from '$lib/server/units';
import { orgRowOr404 } from '$lib/server/org';
import { dayNoon } from '$lib/format';

type Writer = typeof db | Tx;

// ── Filters ───────────────────────────────────────────────────────────────────────────────────

export type TransactionFilters = {
	from: string;
	to: string;
	direction: (typeof TRANSACTION_DIRECTIONS)[number] | '';
	status: (typeof TRANSACTION_STATUSES)[number] | '';
	purpose: (typeof TRANSACTION_PURPOSES)[number] | '';
	methodId: number;
	branchId: number;
	q: string;
};

const isDay = (v: string | null): v is string => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);
const pick = <T extends readonly string[]>(list: T, v: string | null): T[number] | '' =>
	v && (list as readonly string[]).includes(v) ? (v as T[number]) : '';

/** A calendar day from the Ethiopian calendar's `{ year, month, day }`. */
const gregorianDay = (g: { year: number; month: number; day: number }) =>
	`${g.year}-${String(g.month).padStart(2, '0')}-${String(g.day).padStart(2, '0')}`;

/**
 * The quick ranges above the list. Months and the fiscal year are Ethiopian — that is how a
 * business here closes its books — and the fiscal year starts on Hamle 1.
 */
export function datePresets(today: string) {
	const eth = getEthiopianYearMonth(dayNoon(today))!;
	const monthStart = gregorianDay(ethiopianRange(eth.month, eth.year).startDate);
	const fyStart = gregorianDay(ethiopianRange(11, ethiopianFiscalYear(today) - 1).startDate);
	return [
		{ key: 'today', label: m.sales_preset_today(), from: today, to: today },
		{ key: '7d', label: m.sales_preset_7d(), from: addLocalDays(today, -6), to: today },
		{ key: 'month', label: m.sales_preset_month(), from: monthStart, to: today },
		{ key: '30d', label: m.sales_preset_30d(), from: addLocalDays(today, -29), to: today },
		{ key: 'fy', label: m.sales_preset_fy(), from: fyStart, to: today }
	];
}

/** Filters from the query string, anything unrecognised dropped. Defaults to the last 30 days. */
export function parseFilters(url: URL, today: string): TransactionFilters {
	const p = url.searchParams;
	const from = isDay(p.get('from')) ? p.get('from')! : addLocalDays(today, -29);
	const to = isDay(p.get('to')) ? p.get('to')! : today;
	return {
		from: from <= to ? from : to,
		to: from <= to ? to : from,
		direction: pick(TRANSACTION_DIRECTIONS, p.get('direction')),
		status: pick(TRANSACTION_STATUSES, p.get('status')),
		purpose: pick(TRANSACTION_PURPOSES, p.get('purpose')),
		methodId: Number(p.get('method')) || 0,
		branchId: Number(p.get('branch')) || 0,
		q: (p.get('q') ?? '').trim().slice(0, 100)
	};
}

function where(orgId: number, f: TransactionFilters, { includeVoid }: { includeVoid: boolean }) {
	const like = `%${f.q.replace(/[%_\\]/g, '\\$&')}%`;
	const conditions: (SQL | undefined)[] = [
		eq(transactions.orgId, orgId),
		isNull(transactions.deletedAt),
		gte(transactions.occurredOn, f.from),
		lte(transactions.occurredOn, f.to),
		f.direction ? eq(transactions.direction, f.direction) : undefined,
		f.status ? eq(transactions.status, f.status) : undefined,
		!f.status && !includeVoid ? ne(transactions.status, 'void') : undefined,
		f.purpose ? eq(transactions.purpose, f.purpose) : undefined,
		f.methodId ? eq(transactions.paymentMethodId, f.methodId) : undefined,
		f.branchId ? eq(transactions.branchId, f.branchId) : undefined,
		f.q
			? or(
					sql`${transactions.party} LIKE ${like}`,
					sql`${transactions.reference} LIKE ${like}`,
					sql`${transactions.receiptNumber} LIKE ${like}`,
					sql`${transactions.description} LIKE ${like}`
				)
			: undefined
	];
	return and(...conditions);
}

// ── Reading ───────────────────────────────────────────────────────────────────────────────────

const attachmentCount = sql<number>`(
	SELECT COUNT(*) FROM ${transactionAttachment}
	WHERE ${transactionAttachment.transactionId} = ${qualified(transactions, transactions.id)}
		AND ${transactionAttachment.deletedAt} IS NULL
)`;

const linkedDocuments = sql<string | null>`(
	SELECT GROUP_CONCAT(COALESCE(${stockDocument.number}, CONCAT('#', ${stockDocument.id})) SEPARATOR ', ')
	FROM ${stockDocument} WHERE ${stockDocument.transactionId} = ${qualified(transactions, transactions.id)}
)`;

/** The list, newest first. Voided rows are included (struck through on screen) unless filtered. */
export async function transactionList(orgId: number, f: TransactionFilters) {
	return db
		.select({
			id: transactions.id,
			occurredOn: transactions.occurredOn,
			direction: transactions.direction,
			amount: transactions.amount,
			purpose: transactions.purpose,
			method: paymentMethod.name,
			methodId: transactions.paymentMethodId,
			receiptNumber: transactions.receiptNumber,
			reference: transactions.reference,
			party: transactions.party,
			description: transactions.description,
			status: transactions.status,
			branch: branch.name,
			recordedBy: user.name,
			attachments: attachmentCount,
			documents: linkedDocuments
		})
		.from(transactions)
		.leftJoin(paymentMethod, eq(paymentMethod.id, transactions.paymentMethodId))
		.leftJoin(branch, eq(branch.id, transactions.branchId))
		.leftJoin(user, eq(user.id, transactions.createdBy))
		.where(where(orgId, f, { includeVoid: true }))
		.orderBy(desc(transactions.occurredOn), desc(transactions.id))
		.limit(2000);
}

/** Money in, money out and the difference, for the same filters. Voided rows never count. */
export async function transactionTotals(orgId: number, f: TransactionFilters, reader: Writer = db) {
	const [row] = await reader
		.select({
			moneyIn: sql<number>`COALESCE(SUM(CASE WHEN ${transactions.direction} = 'in' THEN ${transactions.amount} END), 0)`,
			moneyOut: sql<number>`COALESCE(SUM(CASE WHEN ${transactions.direction} = 'out' THEN ${transactions.amount} END), 0)`,
			count: sql<number>`COUNT(*)`,
			unverified: sql<number>`SUM(${transactions.status} = 'recorded')`
		})
		.from(transactions)
		.where(and(where(orgId, f, { includeVoid: false }), ne(transactions.status, 'void')));

	const moneyIn = Number(row.moneyIn);
	const moneyOut = Number(row.moneyOut);
	return {
		moneyIn,
		moneyOut,
		net: cents(moneyIn - moneyOut),
		count: Number(row.count),
		unverified: Number(row.unverified ?? 0)
	};
}

/** Money in and out per payment method, for the same filters — what should be in each till or account. */
export async function totalsByMethod(orgId: number, f: TransactionFilters) {
	const rows = await db
		.select({
			method: sql<string>`COALESCE(${paymentMethod.name}, ${m.sales_not_said()})`,
			moneyIn: sql<number>`COALESCE(SUM(CASE WHEN ${transactions.direction} = 'in' THEN ${transactions.amount} END), 0)`,
			moneyOut: sql<number>`COALESCE(SUM(CASE WHEN ${transactions.direction} = 'out' THEN ${transactions.amount} END), 0)`
		})
		.from(transactions)
		.leftJoin(paymentMethod, eq(paymentMethod.id, transactions.paymentMethodId))
		.where(and(where(orgId, f, { includeVoid: false }), ne(transactions.status, 'void')))
		.groupBy(paymentMethod.id, paymentMethod.name)
		.orderBy(asc(paymentMethod.name));
	return rows.map((r) => ({ ...r, moneyIn: Number(r.moneyIn), moneyOut: Number(r.moneyOut) }));
}

export async function orgTransaction(orgId: number, id: number) {
	return orgRowOr404(transactions, orgId, id, m.sales_tx_not_found);
}

export async function attachmentsOf(orgId: number, transactionId: number) {
	return db
		.select({
			id: transactionAttachment.id,
			fileName: transactionAttachment.fileName,
			originalName: transactionAttachment.originalName,
			mimeType: transactionAttachment.mimeType,
			sizeBytes: transactionAttachment.sizeBytes,
			createdAt: transactionAttachment.createdAt,
			uploadedBy: user.name
		})
		.from(transactionAttachment)
		.leftJoin(user, eq(user.id, transactionAttachment.uploadedBy))
		.where(
			and(
				eq(transactionAttachment.orgId, orgId),
				eq(transactionAttachment.transactionId, transactionId),
				isNull(transactionAttachment.deletedAt)
			)
		)
		.orderBy(asc(transactionAttachment.id));
}

/** Transactions to offer when linking a document: this business's, not voided, newest first. */
export async function linkableTransactions(orgId: number) {
	const rows = await db
		.select({
			id: transactions.id,
			occurredOn: transactions.occurredOn,
			direction: transactions.direction,
			amount: transactions.amount,
			party: transactions.party,
			reference: transactions.reference,
			method: paymentMethod.name
		})
		.from(transactions)
		.leftJoin(paymentMethod, eq(paymentMethod.id, transactions.paymentMethodId))
		.where(
			and(
				eq(transactions.orgId, orgId),
				isNull(transactions.deletedAt),
				ne(transactions.status, 'void')
			)
		)
		.orderBy(desc(transactions.occurredOn), desc(transactions.id))
		.limit(300);
	return rows.map((t) => ({
		value: t.id,
		name: [
			`#${t.id}`,
			t.occurredOn,
			`${t.direction === 'in' ? '+' : '−'}${t.amount.toFixed(2)}`,
			t.method,
			t.party,
			t.reference
		]
			.filter(Boolean)
			.join(' · ')
	}));
}

/**
 * What a document is worth, as a starting amount for its payment: a receipt at the costs typed on
 * its lines, anything else at the items' sale prices. Only a suggestion; the form can change it.
 */
export async function documentValue(documentId: number): Promise<number> {
	const [doc] = await db.select().from(stockDocument).where(eq(stockDocument.id, documentId));
	const lines = await db
		.select({
			quantity: stockDocumentLine.quantity,
			unitCost: stockDocumentLine.unitCost,
			unitPrice: stockDocumentLine.unitPrice,
			uomId: stockDocumentLine.uomId,
			itemId: stockDocumentLine.itemId,
			baseUomId: item.baseUomId,
			salePrice: item.salePrice
		})
		.from(stockDocumentLine)
		.innerJoin(item, eq(item.id, stockDocumentLine.itemId))
		.where(and(eq(stockDocumentLine.documentId, documentId), isNull(stockDocumentLine.deletedAt)));

	if (doc.type === 'receipt') {
		return cents(lines.reduce((s, l) => s + Math.abs(l.quantity) * (l.unitCost ?? 0), 0));
	}

	const itemIds = [...new Set(lines.map((l) => l.itemId))];
	const factors = await packsOf(db, itemIds);
	let total = 0;
	for (const l of lines) {
		const factor = factorIn(factors, { id: l.itemId, baseUomId: l.baseUomId }, l.uomId) ?? 1;
		// The line's own sale price when it has one; otherwise the list price.
		total +=
			l.unitPrice !== null
				? Math.abs(l.quantity) * l.unitPrice
				: round4(Math.abs(l.quantity) * factor) * (l.salePrice ?? 0);
	}
	return cents(total);
}

// ── Writing ───────────────────────────────────────────────────────────────────────────────────

/**
 * The server's checks on a transaction form: the payment method and branch are this business's,
 * and the reference has not been used before.
 *
 * The reference check is the one that matters most here. A bank FT number or a Telebirr
 * transaction ID identifies one real payment, and the same screenshot presented twice — for two
 * deliveries, or by two customers — is the commonest way a business here gets paid once and
 * records it twice.
 */
export async function checkTransaction(
	values: Record<string, unknown>,
	orgId: number,
	excludeId?: number,
	/** The database, or the caller's transaction (tests read their own uncommitted rows). */
	reader: Writer = db
) {
	const methodId = Number(values.paymentMethodId) || null;
	const branchId = Number(values.branchId) || null;
	const supplierId = Number(values.supplierId) || null;
	let supplierName: string | null = null;

	if (methodId) {
		const [method] = await reader
			.select({ id: paymentMethod.id })
			.from(paymentMethod)
			.where(and(eq(paymentMethod.id, methodId), eq(paymentMethod.orgId, orgId)));
		if (!method) throw new WriteRefused('paymentMethodId', m.sales_err_choose_method());
	}
	if (branchId) {
		const [b] = await reader
			.select({ id: branch.id })
			.from(branch)
			.where(and(eq(branch.id, branchId), eq(branch.orgId, orgId)));
		if (!b) throw new WriteRefused('branchId', m.sales_err_choose_branch());
	}

	if (supplierId) {
		const [s] = await reader
			.select({ name: supplier.name })
			.from(supplier)
			.where(and(eq(supplier.id, supplierId), eq(supplier.orgId, orgId)));
		if (!s) throw new WriteRefused('supplierId', m.sales_err_choose_supplier());
		supplierName = s.name;
	}

	// Optional: most takings are from people who never gave a name.
	const customerId = Number(values.customerId) || null;
	let customerName: string | null = null;
	if (customerId) {
		const [c] = await reader
			.select({ name: customer.name })
			.from(customer)
			.where(
				and(eq(customer.id, customerId), eq(customer.orgId, orgId), isNull(customer.deletedAt))
			);
		if (!c) throw new WriteRefused('customerId', m.sales_err_choose_customer());
		customerName = c.name;
	}

	const reference = String(values.reference ?? '').trim();
	if (reference) {
		const [dup] = await reader
			.select({ id: transactions.id, occurredOn: transactions.occurredOn })
			.from(transactions)
			.where(
				and(
					eq(transactions.orgId, orgId),
					sql`LOWER(${transactions.reference}) = LOWER(${reference})`,
					ne(transactions.status, 'void'),
					isNull(transactions.deletedAt),
					excludeId ? ne(transactions.id, excludeId) : undefined
				)
			);
		if (dup) {
			throw new WriteRefused(
				'reference',
				m.sales_err_reference_on_tx({ reference, id: dup.id, date: dup.occurredOn })
			);
		}
	}

	return {
		direction: values.direction as (typeof TRANSACTION_DIRECTIONS)[number],
		amount: cents(Number(values.amount)),
		occurredOn: String(values.occurredOn),
		paymentMethodId: methodId,
		purpose: values.purpose as (typeof TRANSACTION_PURPOSES)[number],
		receiptNumber: String(values.receiptNumber ?? '') || null,
		reference: reference || null,
		// No name typed: the supplier paid, or the customer who paid, is the party.
		party: String(values.party ?? '') || supplierName || customerName,
		supplierId,
		customerId,
		withheld: cents(Number(values.withheld ?? 0)),
		withholdingReceipt: String(values.withholdingReceipt ?? '') || null,
		description: String(values.description ?? '') || null,
		branchId
	};
}

/** Stores an uploaded file with the kit's file store and files it under the transaction. */
export async function addAttachment(
	writer: Writer,
	input: { orgId: number; transactionId: number; file: File; userId?: string }
) {
	const fileName = await saveUploadedFile(input.file);
	await writer.insert(transactionAttachment).values({
		orgId: input.orgId,
		transactionId: input.transactionId,
		fileName,
		originalName: input.file.name.slice(0, 255),
		mimeType: input.file.type,
		sizeBytes: input.file.size,
		uploadedBy: input.userId ?? null
	});
	return fileName;
}

/**
 * Whether a stored file belongs to this business: a transaction attachment, its logo, or a
 * receipt for its subscription. The file
 * route asks before serving anything.
 */
export async function ownsFile(orgId: number, fileName: string, reader: Writer = db) {
	const [logo] = await reader
		.select({ id: organization.id })
		.from(organization)
		.where(and(eq(organization.id, orgId), eq(organization.logo, fileName)));
	if (logo) return true;
	// The transfer receipt it uploaded when paying for its subscription.
	if (await ownsReceipt(orgId, fileName, reader)) return true;

	const [row] = await reader
		.select({ id: transactionAttachment.id })
		.from(transactionAttachment)
		.where(
			and(
				eq(transactionAttachment.fileName, fileName),
				eq(transactionAttachment.orgId, orgId),
				isNull(transactionAttachment.deletedAt)
			)
		);
	return Boolean(row);
}
