/**
 * The money side of a stock document: the transaction a delivery was paid with, or a sale was
 * paid by. Loaded into, and posted from, the document's own page.
 */
import { fail, type RequestEvent } from '@sveltejs/kit';
import { and, eq, isNull, ne } from 'drizzle-orm';
import { message, setError, superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { setFlash } from 'sveltekit-flash-message/server';
import { WriteRefused } from '@nahu/admin-kit/server/childCrud';
import { hasPermission, requirePermission } from '@nahu/admin-kit/server/permissions';
import { db } from '$lib/server/db';
import {
	customer,
	paymentMethod,
	stockDocument,
	supplier,
	transactionAttachment,
	transactions
} from '$lib/server/db/schema';
import { orgIdOf } from '$lib/server/tenant';
import { branchOptions, methodOptions, supplierOptions } from '$lib/server/options';
import { orgDocument } from '$lib/server/stock/documents';
import { customerChoices } from '$lib/server/customers';
import { documentTotals, suggestedWithholding } from '$lib/server/tax';
import { addAttachment, checkTransaction, linkableTransactions } from '$lib/server/transactions';
import { linkSchema, transactionAdd } from '$lib/schemas/transactions';

type Doc = typeof stockDocument.$inferSelect;

/** What a new payment for this kind of document most likely is. */
function defaultsFor(doc: Doc) {
	switch (doc.type) {
		case 'receipt':
			return { direction: 'out', purpose: 'purchase' } as const;
		case 'issue':
			return { direction: 'in', purpose: 'sale' } as const;
		// A refund to the customer; a refund from the supplier.
		case 'sales_return':
			return { direction: 'out', purpose: 'sale' } as const;
		case 'purchase_return':
			return { direction: 'in', purpose: 'purchase' } as const;
		default:
			return { direction: 'out', purpose: 'expense' } as const;
	}
}

export async function paymentSection(orgId: number, doc: Doc, locals: App.Locals) {
	const canManage = hasPermission(locals, 'transactions.manage');

	const [payment] = doc.transactionId
		? await db
				.select({
					id: transactions.id,
					direction: transactions.direction,
					amount: transactions.amount,
					occurredOn: transactions.occurredOn,
					method: paymentMethod.name,
					reference: transactions.reference,
					receiptNumber: transactions.receiptNumber,
					party: transactions.party,
					status: transactions.status
				})
				.from(transactions)
				.leftJoin(paymentMethod, eq(paymentMethod.id, transactions.paymentMethodId))
				.where(and(eq(transactions.id, doc.transactionId), eq(transactions.orgId, orgId)))
		: [];

	const files = payment
		? await db
				.select({
					fileName: transactionAttachment.fileName,
					mimeType: transactionAttachment.mimeType
				})
				.from(transactionAttachment)
				.where(
					and(
						eq(transactionAttachment.transactionId, payment.id),
						isNull(transactionAttachment.deletedAt)
					)
				)
		: [];

	// A sale paid in parts (cash and Telebirr, say): the other payments filed under it.
	const otherPayments = await db
		.select({
			id: transactions.id,
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
				eq(transactions.documentId, doc.id),
				doc.transactionId ? ne(transactions.id, doc.transactionId) : undefined
			)
		);

	// The forms and pickers only matter to someone who may record money.
	if (!canManage || payment || doc.status === 'cancelled') {
		return {
			payment: payment ?? null,
			paymentFiles: files,
			otherPayments,
			canManage,
			canPay: false as const
		};
	}

	const [methods, branches, suppliers, customers, linkable, totals] = await Promise.all([
		methodOptions(orgId),
		branchOptions(orgId),
		supplierOptions(orgId),
		customerChoices(orgId),
		linkableTransactions(orgId),
		// Only deliveries, sales and their returns have a value that is the payment; a transfer or
		// adjustment moves no money, and a payment on one is transport or loading, typed in by hand.
		doc.type === 'transfer' || doc.type === 'adjustment'
			? Promise.resolve(null)
			: documentTotals(orgId, doc.id)
	]);
	// Withholding: ours from a supplier's delivery, or a customer's from our sale, on the amount
	// before VAT. The cash is the rest.
	const withholding = totals
		? await suggestedWithholding(orgId, doc, totals.net)
		: { amount: 0, rate: 0 };
	const amount = totals ? Math.round((totals.gross - withholding.amount) * 100) / 100 : 0;

	const [named] = doc.supplierId
		? await db.select({ name: supplier.name }).from(supplier).where(eq(supplier.id, doc.supplierId))
		: [];
	const supplierName = named?.name ?? null;
	// A sale to a listed customer: the payment is theirs too.
	const [buyer] = doc.customerId
		? await db.select({ name: customer.name }).from(customer).where(eq(customer.id, doc.customerId))
		: [];

	const [paymentForm, linkForm] = await Promise.all([
		superValidate(
			{
				...defaultsFor(doc),
				amount: amount || undefined,
				occurredOn: doc.docDate,
				party: supplierName ?? buyer?.name ?? doc.party ?? '',
				supplierId: doc.supplierId ?? 0,
				customerId: doc.customerId ?? 0,
				receiptNumber: doc.reference ?? '',
				branchId: doc.branchId,
				withheld: withholding.amount
			},
			zod4(transactionAdd),
			{ errors: false }
		),
		superValidate(zod4(linkSchema))
	]);

	return {
		payment: null,
		paymentFiles: files,
		otherPayments,
		canManage,
		canPay: true as const,
		paymentForm,
		linkForm,
		suggestedAmount: amount,
		totals: totals && { net: totals.net, vat: totals.vat, gross: totals.gross },
		withholding,
		methods: [{ value: 0, name: '— Not said —' }, ...methods],
		branches: [{ value: 0, name: 'Whole business' }, ...branches],
		suppliers,
		customers,
		linkable
	};
}

async function payableDocument(event: RequestEvent) {
	requirePermission(event.locals, 'transactions.manage');
	const orgId = orgIdOf(event.locals);
	const doc = await orgDocument(orgId, Number(event.params.id));
	return { orgId, doc };
}

export const paymentActions = {
	/** Records a new transaction and links it to this document, in one go. */
	recordPayment: async (event: RequestEvent) => {
		const form = await superValidate(event.request, zod4(transactionAdd));
		if (!form.valid)
			return message(form, { type: 'error', text: 'Please check the form' }, { status: 400 });
		const { orgId, doc } = await payableDocument(event);

		if (doc.status === 'cancelled') {
			return message(form, { type: 'error', text: 'This document is cancelled.' }, { status: 409 });
		}
		if (doc.transactionId) {
			return message(
				form,
				{ type: 'error', text: 'This document already has a payment.' },
				{ status: 409 }
			);
		}

		try {
			const values = await checkTransaction(form.data, orgId);
			await db.transaction(async (tx) => {
				const [row] = await tx
					.insert(transactions)
					.values({ ...values, orgId, createdBy: event.locals.user?.id })
					.$returningId();
				if (form.data.file) {
					await addAttachment(tx, {
						orgId,
						transactionId: row.id,
						file: form.data.file,
						userId: event.locals.user?.id
					});
				}
				await tx
					.update(stockDocument)
					.set({ transactionId: row.id, updatedBy: event.locals.user?.id })
					.where(eq(stockDocument.id, doc.id));
			});
		} catch (err) {
			if (err instanceof WriteRefused) {
				if (err.field) setError(form, err.field as 'reference', err.message);
				return message(form, { type: 'error', text: err.message }, { status: 400 });
			}
			console.error('record payment failed', err);
			return message(
				form,
				{ type: 'error', text: 'Could not record the payment.' },
				{ status: 500 }
			);
		}
		return message(form, { type: 'success', text: 'Payment recorded' });
	},

	/** Links a transaction that already exists — one payment can cover several deliveries. */
	linkTransaction: async (event: RequestEvent) => {
		const form = await superValidate(event.request, zod4(linkSchema));
		if (!form.valid)
			return message(form, { type: 'error', text: 'Choose a transaction' }, { status: 400 });
		const { orgId, doc } = await payableDocument(event);

		const [txn] = await db
			.select({ id: transactions.id })
			.from(transactions)
			.where(
				and(
					eq(transactions.id, form.data.transactionId),
					eq(transactions.orgId, orgId),
					ne(transactions.status, 'void'),
					isNull(transactions.deletedAt)
				)
			);
		if (!txn) {
			setError(form, 'transactionId', 'Choose a transaction from the list.');
			return message(
				form,
				{ type: 'error', text: 'Choose a transaction from the list.' },
				{ status: 400 }
			);
		}

		await db
			.update(stockDocument)
			.set({ transactionId: txn.id, updatedBy: event.locals.user?.id })
			.where(eq(stockDocument.id, doc.id));
		return message(form, { type: 'success', text: `Linked to transaction #${txn.id}` });
	},

	/** Takes the link off. The transaction itself stays, on the transactions list. */
	unlinkTransaction: async (event: RequestEvent) => {
		const { doc } = await payableDocument(event);
		await db
			.update(stockDocument)
			.set({ transactionId: null, updatedBy: event.locals.user?.id })
			.where(eq(stockDocument.id, doc.id));
		setFlash(
			{ type: 'success', message: 'Payment unlinked; the transaction is still recorded.' },
			event.cookies
		);
		return doc.transactionId ? { unlinked: true } : fail(409);
	}
};
