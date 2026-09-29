/**
 * Customers: who took stock and what they paid. Everything here is optional to the rest of the
 * system — an issue or a payment without a customer is complete — and every query is filtered by
 * the business first.
 */
import { error } from '@sveltejs/kit';
import { and, asc, desc, eq, isNull, ne, sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { qualified } from '$lib/server/db/sql';
import {
	customer,
	organization,
	paymentMethod,
	stockDocument,
	stockMovement,
	transactions
} from '$lib/server/db/schema';
import { customerOptions } from '$lib/server/options';
import type { Tx } from '$lib/server/stock/post';

type Reader = Pick<typeof db, 'select'> | Tx;

const customerRef = qualified(customer, customer.id);

/**
 * Goods taken: what posted issues to this customer cost. Qualified throughout: the outer query has
 * no joins, so Drizzle writes bare column names, and inside this JOIN `id` would be ambiguous.
 */
const takenValue = sql<number>`COALESCE((
	SELECT SUM(-${qualified(stockMovement, stockMovement.quantity)} * ${qualified(stockMovement, stockMovement.unitCost)})
	FROM ${stockMovement}
	JOIN ${stockDocument}
		ON ${qualified(stockDocument, stockDocument.id)} = ${qualified(stockMovement, stockMovement.documentId)}
	WHERE ${qualified(stockDocument, stockDocument.customerId)} = ${customerRef}
		AND ${qualified(stockMovement, stockMovement.kind)} = 'issue'
), 0)`;

/** Paid: money in from this customer, voided transactions excluded. */
const paidValue = sql<number>`COALESCE((
	SELECT SUM(${transactions.amount}) FROM ${transactions}
	WHERE ${transactions.customerId} = ${customerRef} AND ${transactions.direction} = 'in'
		AND ${transactions.status} <> 'void' AND ${transactions.deletedAt} IS NULL
), 0)`;

export async function customerList(orgId: number, reader: Reader = db) {
	const rows = await reader
		.select({
			id: customer.id,
			name: customer.name,
			phone: customer.phone,
			email: customer.email,
			address: customer.address,
			tin: customer.tin,
			status: customer.isActive,
			purchases: sql<number>`(SELECT COUNT(*) FROM ${stockDocument} WHERE ${stockDocument.customerId} = ${customerRef} AND ${stockDocument.status} = 'posted')`,
			lastPurchase: sql<
				string | null
			>`(SELECT MAX(${stockDocument.docDate}) FROM ${stockDocument} WHERE ${stockDocument.customerId} = ${customerRef} AND ${stockDocument.status} = 'posted')`,
			taken: takenValue,
			paid: paidValue
		})
		.from(customer)
		.where(and(eq(customer.orgId, orgId), isNull(customer.deletedAt)))
		.orderBy(asc(customer.name));

	return rows.map((r) => ({
		...r,
		purchases: Number(r.purchases),
		taken: Math.round(Number(r.taken) * 100) / 100,
		paid: Math.round(Number(r.paid) * 100) / 100
	}));
}

export async function orgCustomer(orgId: number, id: number) {
	const [row] = await db
		.select()
		.from(customer)
		.where(and(eq(customer.id, id), eq(customer.orgId, orgId), isNull(customer.deletedAt)));
	if (!row) error(404, 'Customer not found');
	return row;
}

/** Form values as columns: empty optional fields become nulls. */
export function customerValues(data: {
	name: string;
	phone: string;
	email: string;
	address: string;
	tin: string;
	note: string;
	creditLimit?: number | null;
	creditDays?: number;
	withholdsTax?: boolean;
}) {
	return {
		withholdsTax: data.withholdsTax ?? false,
		creditLimit: data.creditLimit ?? null,
		creditDays: data.creditDays ?? 30,
		name: data.name,
		phone: data.phone || null,
		email: data.email || null,
		address: data.address || null,
		tin: data.tin || null,
		note: data.note || null
	};
}

/**
 * Another customer of this business with the same name and the same phone (or both without one):
 * almost certainly the same person entered twice. Different phones are different people.
 */
export async function duplicateCustomer(
	orgId: number,
	name: string,
	phone: string | null,
	excludeId?: number
) {
	const [dup] = await db
		.select({ id: customer.id })
		.from(customer)
		.where(
			and(
				eq(customer.orgId, orgId),
				isNull(customer.deletedAt),
				sql`LOWER(${customer.name}) = LOWER(${name})`,
				phone
					? sql`REGEXP_REPLACE(${customer.phone}, '[^0-9]', '') = ${phone.replace(/[^0-9]/g, '')}`
					: isNull(customer.phone),
				excludeId ? ne(customer.id, excludeId) : undefined
			)
		);
	return dup?.id ?? null;
}

/** A customer id from a form, checked: this business's, and still active. 0 means none. */
export async function checkCustomer(orgId: number, id: number, reader: Reader = db) {
	if (!id) return null;
	const [row] = await reader
		.select({ id: customer.id, name: customer.name })
		.from(customer)
		.where(
			and(
				eq(customer.id, id),
				eq(customer.orgId, orgId),
				eq(customer.isActive, true),
				isNull(customer.deletedAt)
			)
		);
	return row ?? false;
}

/** Whether the business sells to customers at all (an internal store does not). */
export async function sellsToCustomers(orgId: number) {
	const [org] = await db
		.select({ on: organization.sellsToCustomers })
		.from(organization)
		.where(eq(organization.id, orgId));
	return org?.on ?? false;
}

/** The customer picker's options, or `null` when the business does not sell. */
export async function customerChoices(orgId: number) {
	return (await sellsToCustomers(orgId)) ? customerOptions(orgId) : null;
}

/** Everything the customer's own page shows. */
export async function customerDetail(orgId: number, customerId: number) {
	const [purchases, payments] = await Promise.all([
		db
			.select({
				id: stockDocument.id,
				number: stockDocument.number,
				status: stockDocument.status,
				docDate: stockDocument.docDate,
				reference: stockDocument.reference,
				value: sql<number>`COALESCE((
					SELECT SUM(-${stockMovement.quantity} * ${stockMovement.unitCost}) FROM ${stockMovement}
					WHERE ${stockMovement.documentId} = ${qualified(stockDocument, stockDocument.id)}
				), 0)`,
				paymentId: stockDocument.transactionId
			})
			.from(stockDocument)
			.where(
				and(
					eq(stockDocument.orgId, orgId),
					eq(stockDocument.customerId, customerId),
					ne(stockDocument.status, 'cancelled')
				)
			)
			.orderBy(desc(stockDocument.docDate), desc(stockDocument.id)),
		db
			.select({
				id: transactions.id,
				occurredOn: transactions.occurredOn,
				direction: transactions.direction,
				amount: transactions.amount,
				method: paymentMethod.name,
				reference: transactions.reference,
				status: transactions.status
			})
			.from(transactions)
			.leftJoin(paymentMethod, eq(paymentMethod.id, transactions.paymentMethodId))
			.where(
				and(
					eq(transactions.orgId, orgId),
					eq(transactions.customerId, customerId),
					isNull(transactions.deletedAt)
				)
			)
			.orderBy(desc(transactions.occurredOn), desc(transactions.id))
	]);

	const live = payments.filter((p) => p.status !== 'void');
	const sum = (list: typeof live) => Math.round(list.reduce((s, p) => s + p.amount, 0) * 100) / 100;
	return {
		purchases: purchases.map((p) => ({ ...p, value: Math.round(Number(p.value) * 100) / 100 })),
		payments,
		totals: {
			taken:
				Math.round(
					purchases.filter((p) => p.status === 'posted').reduce((s, p) => s + Number(p.value), 0) *
						100
				) / 100,
			paid: sum(live.filter((p) => p.direction === 'in')),
			refunded: sum(live.filter((p) => p.direction === 'out'))
		}
	};
}
