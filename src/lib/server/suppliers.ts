/**
 * Suppliers: who they are, what they delivered, what was paid, and what is still owed. Every
 * query is filtered by the business first.
 */
import { error } from '@sveltejs/kit';
import { and, asc, desc, eq, isNull, ne, sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { qualified } from '$lib/server/db/sql';
import {
	item,
	paymentMethod,
	stockDocument,
	stockDocumentLine,
	stockMovement,
	supplier,
	transactions,
	uom
} from '$lib/server/db/schema';

/** The outer supplier row, for the correlated subqueries below. See `qualified`. */
const supplierRef = qualified(supplier, supplier.id);

/** Value delivered: what posted receipts from this supplier cost. */
const receivedValue = sql<number>`COALESCE((
	SELECT SUM(${stockMovement.quantity} * ${stockMovement.unitCost}) FROM ${stockMovement}
	WHERE ${stockMovement.supplierId} = ${supplierRef} AND ${stockMovement.kind} = 'receipt'
), 0)`;

/** Paid: money out to this supplier, voided transactions excluded. */
const paidValue = sql<number>`COALESCE((
	SELECT SUM(${transactions.amount}) FROM ${transactions}
	WHERE ${transactions.supplierId} = ${supplierRef} AND ${transactions.direction} = 'out'
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
}) {
	return {
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
				// Posted: what the ledger says it cost. A draft has no ledger rows yet; its lines say.
				value: sql<number>`CASE WHEN ${stockDocument.status} = 'posted' THEN COALESCE((
					SELECT SUM(${stockMovement.quantity} * ${stockMovement.unitCost}) FROM ${stockMovement}
					WHERE ${stockMovement.documentId} = ${qualified(stockDocument, stockDocument.id)}
				), 0) ELSE COALESCE((
					SELECT SUM(${stockDocumentLine.quantity} * COALESCE(${stockDocumentLine.unitCost}, 0))
					FROM ${stockDocumentLine}
					WHERE ${stockDocumentLine.documentId} = ${qualified(stockDocument, stockDocument.id)}
						AND ${stockDocumentLine.deletedAt} IS NULL
				), 0) END`,
				paymentId: stockDocument.transactionId
			})
			.from(stockDocument)
			.where(
				and(
					eq(stockDocument.orgId, orgId),
					eq(stockDocument.supplierId, supplierId),
					eq(stockDocument.type, 'receipt'),
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

	const received = deliveries
		.filter((d) => d.status === 'posted')
		.reduce((s, d) => s + Number(d.value), 0);
	const paid = payments
		.filter((p) => p.direction === 'out' && p.status !== 'void')
		.reduce((s, p) => s + p.amount, 0);

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
