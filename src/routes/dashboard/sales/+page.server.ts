import { and, desc, eq, gte, inArray, isNull, lte, sql } from 'drizzle-orm';
import { addLocalDays, localToday } from '@nahu/admin-kit/time';
import { db } from '$lib/server/db';
import { qualified } from '$lib/server/db/sql';
import { customer, stockDocument, stockDocumentLine, transactions } from '$lib/server/db/schema';
import { orgIdOf } from '$lib/server/tenant';
import { branchScope, scopeWhere } from '$lib/server/scope';
import { datePresets } from '$lib/server/transactions';
import { lineNetSql, lineTotSql, lineVatSql } from '$lib/server/tax';
import { m } from '$lib/paraglide/messages.js';
import type { PageServerLoad } from './$types';

const isDay = (v: string | null): v is string => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);
const doc = (c: Parameters<typeof qualified>[1]) => qualified(stockDocument, c);

/** Sales and customer returns — the ones with prices: an internal issue is not a sale. */
export const load: PageServerLoad = async ({ locals, url }) => {
	const orgId = orgIdOf(locals);
	const scope = await branchScope(locals);
	const today = localToday();
	let from = isDay(url.searchParams.get('from'))
		? url.searchParams.get('from')!
		: addLocalDays(today, -29);
	let to = isDay(url.searchParams.get('to')) ? url.searchParams.get('to')! : today;
	if (from > to) [from, to] = [to, from];

	const total = sql<number>`(
		SELECT COALESCE(SUM(${lineNetSql} + ${lineVatSql} + ${lineTotSql}), 0) FROM ${stockDocumentLine}
		WHERE ${qualified(stockDocumentLine, stockDocumentLine.documentId)} = ${doc(stockDocument.id)}
			AND ${qualified(stockDocumentLine, stockDocumentLine.deletedAt)} IS NULL
	)`;
	const priced = sql<number>`(
		SELECT COUNT(*) FROM ${stockDocumentLine}
		WHERE ${qualified(stockDocumentLine, stockDocumentLine.documentId)} = ${doc(stockDocument.id)}
			AND ${qualified(stockDocumentLine, stockDocumentLine.unitPrice)} IS NOT NULL
			AND ${qualified(stockDocumentLine, stockDocumentLine.deletedAt)} IS NULL
	)`;
	const paid = sql<number>`(
		SELECT COALESCE(SUM(${qualified(transactions, transactions.amount)} + ${qualified(transactions, transactions.withheld)}), 0)
		FROM ${transactions}
		WHERE (${qualified(transactions, transactions.documentId)} = ${doc(stockDocument.id)}
				OR ${qualified(transactions, transactions.id)} = ${doc(stockDocument.transactionId)})
			AND ${qualified(transactions, transactions.status)} <> 'void'
			AND ${qualified(transactions, transactions.deletedAt)} IS NULL
	)`;

	const rows = await db
		.select({
			id: stockDocument.id,
			type: stockDocument.type,
			number: stockDocument.number,
			status: stockDocument.status,
			docDate: stockDocument.docDate,
			buyer: sql<string>`COALESCE(${customer.name}, ${stockDocument.party}, ${m.sales_pos_walk_in()})`,
			customerId: stockDocument.customerId,
			shiftId: stockDocument.shiftId,
			quoteId: stockDocument.quoteId,
			total,
			paid,
			priced,
			fsNumber: stockDocument.fiscalReceiptNumber,
			einvoiceStatus: stockDocument.einvoiceStatus
		})
		.from(stockDocument)
		.leftJoin(customer, eq(customer.id, stockDocument.customerId))
		.where(
			and(
				eq(stockDocument.orgId, orgId),
				inArray(stockDocument.type, ['issue', 'sales_return']),
				inArray(stockDocument.status, ['draft', 'posted']),
				gte(stockDocument.docDate, from),
				lte(stockDocument.docDate, to),
				isNull(stockDocument.deletedAt),
				scopeWhere(scope, stockDocument.branchId)
			)
		)
		.orderBy(desc(stockDocument.docDate), desc(stockDocument.id))
		.limit(2000);

	const sales = rows
		.filter((r) => Number(r.priced) > 0)
		.map((r) => {
			const sign = r.type === 'sales_return' ? -1 : 1;
			const t = Math.round(Number(r.total) * 100) / 100;
			const p = Math.round(Number(r.paid) * 100) / 100;
			return {
				...r,
				kind: r.type === 'sales_return' ? m.sales_kind_return() : m.sales_kind_sale(),
				channel: r.shiftId
					? m.sales_channel_till()
					: r.quoteId
						? m.sales_channel_proforma()
						: m.sales_channel_office(),
				total: sign * t,
				paid: sign * p,
				balance: r.status === 'posted' ? sign * Math.max(0, Math.round((t - p) * 100) / 100) : 0
			};
		});
	const posted = sales.filter((s) => s.status === 'posted');
	return {
		sales,
		filters: { from, to },
		presets: datePresets(today),
		totals: {
			sold: posted.reduce((s, r) => s + r.total, 0),
			collected: posted.reduce((s, r) => s + r.paid, 0),
			onAccount: posted.reduce((s, r) => s + r.balance, 0),
			count: posted.filter((r) => r.type === 'issue').length
		}
	};
};
