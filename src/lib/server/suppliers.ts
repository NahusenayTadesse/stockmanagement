/**
 * Suppliers: who they are, what they delivered, what was paid, and what is still owed. Every
 * query is filtered by the business first.
 */
import { error } from '@sveltejs/kit';
import { and, asc, desc, eq, inArray, isNull, ne, sql, type Column } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { qualified } from '$lib/server/db/sql';
import { lineNetSql, lineVatSql } from '$lib/server/tax';
import {
	item,
	paymentMethod,
	stockDocument,
	stockDocumentLine,
	supplier,
	transactions,
	uom
} from '$lib/server/db/schema';

/** The outer supplier row, for the correlated subqueries below. See `qualified`. */
const supplierRef = qualified(supplier, supplier.id);

const doc = (c: Column) => qualified(stockDocument, c);
const docLine = (c: Column) => qualified(stockDocumentLine, c);

/**
 * Value delivered: posted receipts from this supplier at the price on each line, VAT included,
 * less what went back to them on returns.
 */
const receivedValue = sql<number>`COALESCE((
	SELECT SUM(CASE WHEN ${doc(stockDocument.type)} = 'receipt' THEN 1 ELSE -1 END * (${lineNetSql} + ${lineVatSql}))
	FROM ${stockDocumentLine}
	JOIN ${stockDocument} ON ${doc(stockDocument.id)} = ${docLine(stockDocumentLine.documentId)}
	WHERE ${doc(stockDocument.supplierId)} = ${supplierRef}
		AND ${doc(stockDocument.type)} IN ('receipt', 'purchase_return')
		AND ${doc(stockDocument.status)} = 'posted'
		AND ${docLine(stockDocumentLine.deletedAt)} IS NULL
), 0)`;

/**
 * Paid: money out to this supplier and the tax we withheld from it, less any refund they paid us
 * back. Voided transactions excluded.
 */
const paidValue = sql<number>`COALESCE((
	SELECT SUM(CASE WHEN ${transactions.direction} = 'out' THEN ${transactions.amount} + ${transactions.withheld} ELSE -${transactions.amount} END)
	FROM ${transactions}
	WHERE ${transactions.supplierId} = ${supplierRef}
		AND ${transactions.status} <> 'void' AND ${transactions.deletedAt} IS NULL
), 0)`;

export async function supplierList(
	orgId: number,
	/** The database, or a test's transaction. */
	reader: Pick<typeof db, 'select'> = db
) {
	const rows = await reader
		.select({
			id: supplier.id,
			name: supplier.name,
			phone: supplier.phone,
			email: supplier.email,
			address: supplier.address,
			tin: supplier.tin,
			contactPerson: supplier.contactPerson,
			status: supplier.isActive,
			items: sql<number>`(SELECT COUNT(*) FROM ${item} WHERE ${item.supplierId} = ${supplierRef} AND ${item.deletedAt} IS NULL)`,
			deliveries: sql<number>`(SELECT COUNT(*) FROM ${stockDocument} WHERE ${stockDocument.supplierId} = ${supplierRef} AND ${stockDocument.type} = 'receipt' AND ${stockDocument.status} = 'posted')`,
			lastDelivery: sql<
				string | null
			>`(SELECT MAX(${stockDocument.docDate}) FROM ${stockDocument} WHERE ${stockDocument.supplierId} = ${supplierRef} AND ${stockDocument.type} = 'receipt' AND ${stockDocument.status} = 'posted')`,
			received: receivedValue,
			paid: paidValue
		})
		.from(supplier)
		.where(and(eq(supplier.orgId, orgId), isNull(supplier.deletedAt)))
		.orderBy(asc(supplier.name));

	return rows.map((r) => {
		const received = Math.round(Number(r.received) * 100) / 100;
		const paid = Number(r.paid);
		return {
			...r,
			items: Number(r.items),
			deliveries: Number(r.deliveries),
			received,
			paid,
			owed: Math.round((received - paid) * 100) / 100
		};
	});
}

export async function orgSupplier(orgId: number, id: number) {
	const [row] = await db
		.select()
		.from(supplier)
		.where(and(eq(supplier.id, id), eq(supplier.orgId, orgId), isNull(supplier.deletedAt)));
	if (!row) error(404, 'Supplier not found');
	return row;
}

/** Form values as columns: empty optional fields become nulls. */
export function supplierValues(data: {
	name: string;
	phone: string;
	email: string;
	address: string;
	tin: string;
	contactPerson: string;
	note: string;
	vatRegistered?: boolean;
	leadTimeDays?: number | null;
}) {
	return {
		vatRegistered: data.vatRegistered ?? false,
		leadTimeDays: data.leadTimeDays ?? null,
		name: data.name,
		phone: data.phone,
		email: data.email || null,
		address: data.address || null,
		tin: data.tin || null,
		contactPerson: data.contactPerson || null,
		note: data.note || null
	};
}

/** Everything the supplier's own page shows. */
export async function supplierDetail(orgId: number, supplierId: number) {
	const [deliveries, items, payments] = await Promise.all([
		db
			.select({
				id: stockDocument.id,
				number: stockDocument.number,
				status: stockDocument.status,
				docDate: stockDocument.docDate,
				reference: stockDocument.reference,
				type: stockDocument.type,
				// At the price on each line; VAT included once posted (a draft's rate is not fixed yet).
				value: sql<number>`COALESCE((
					SELECT SUM(ROUND(${docLine(stockDocumentLine.quantity)} * COALESCE(${docLine(stockDocumentLine.unitCost)}, 0), 2)
						+ ROUND(ROUND(${docLine(stockDocumentLine.quantity)} * COALESCE(${docLine(stockDocumentLine.unitCost)}, 0), 2) * COALESCE(${docLine(stockDocumentLine.vatRate)}, 0) / 100, 2))
					FROM ${stockDocumentLine}
					WHERE ${docLine(stockDocumentLine.documentId)} = ${qualified(stockDocument, stockDocument.id)}
						AND ${docLine(stockDocumentLine.deletedAt)} IS NULL
				), 0)`,
				paymentId: stockDocument.transactionId
			})
			.from(stockDocument)
			.where(
				and(
					eq(stockDocument.orgId, orgId),
					eq(stockDocument.supplierId, supplierId),
					inArray(stockDocument.type, ['receipt', 'purchase_return']),
					ne(stockDocument.status, 'cancelled')
				)
			)
			.orderBy(desc(stockDocument.docDate), desc(stockDocument.id)),
		db
			.select({
				id: item.id,
				sku: item.sku,
				name: item.name,
				unit: uom.symbol,
				avgCost: item.avgCost,
				onHand: sql<number>`(
					SELECT COALESCE(SUM(b.quantity), 0) FROM stock_balance b WHERE b.item_id = ${qualified(item, item.id)}
				)`
			})
			.from(item)
			.innerJoin(uom, eq(uom.id, item.baseUomId))
			.where(and(eq(item.orgId, orgId), eq(item.supplierId, supplierId), isNull(item.deletedAt)))
			.orderBy(asc(item.name)),
		db
			.select({
				id: transactions.id,
				occurredOn: transactions.occurredOn,
				direction: transactions.direction,
				amount: transactions.amount,
				withheld: transactions.withheld,
				method: paymentMethod.name,
				reference: transactions.reference,
				receiptNumber: transactions.receiptNumber,
				status: transactions.status
			})
			.from(transactions)
			.leftJoin(paymentMethod, eq(paymentMethod.id, transactions.paymentMethodId))
			.where(
				and(
					eq(transactions.orgId, orgId),
					eq(transactions.supplierId, supplierId),
					isNull(transactions.deletedAt)
				)
			)
			.orderBy(desc(transactions.occurredOn), desc(transactions.id))
	]);

	// Returns to them take off what they delivered; tax we withheld counts as paid.
	const received = deliveries
		.filter((d) => d.status === 'posted')
		.reduce((s, d) => s + (d.type === 'purchase_return' ? -1 : 1) * Number(d.value), 0);
	const paid = payments
		.filter((p) => p.status !== 'void')
		.reduce((s, p) => s + (p.direction === 'out' ? p.amount + p.withheld : -p.amount), 0);

	return {
		deliveries: deliveries.map((d) => ({ ...d, value: Math.round(Number(d.value) * 100) / 100 })),
		items: items.map((i) => ({ ...i, onHand: Number(i.onHand) })),
		payments,
		totals: {
			received: Math.round(received * 100) / 100,
			paid: Math.round(paid * 100) / 100,
			owed: Math.round((received - paid) * 100) / 100
		}
	};
}
