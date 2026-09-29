import { fail } from '@sveltejs/kit';
import { alias } from 'drizzle-orm/mysql-core';
import { and, eq, isNull } from 'drizzle-orm';
import { message, setError, superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { setFlash } from 'sveltekit-flash-message/server';
import { WriteRefused } from '@nahu/admin-kit/server/childCrud';
import { hasPermission, requirePermission } from '@nahu/admin-kit/server/permissions';
import { recordAudit } from '@nahu/admin-kit/server/audit';
import { db } from '$lib/server/db';
import {
	branch,
	customer,
	paymentMethod,
	stockDocument,
	transactionAttachment,
	transactions,
	user
} from '$lib/server/db/schema';
import { orgIdOf } from '$lib/server/tenant';
import { branchOptions, methodOptions, supplierOptions } from '$lib/server/options';
import { customerChoices } from '$lib/server/customers';
import {
	addAttachment,
	attachmentsOf,
	checkTransaction,
	orgTransaction
} from '$lib/server/transactions';
import { attachmentAdd, transactionEdit, voidSchema } from '$lib/schemas/transactions';
import { m } from '$lib/paraglide/messages.js';
import type { Actions, PageServerLoad, RequestEvent } from './$types';

const verifier = alias(user, 'verifier');

export const load: PageServerLoad = async ({ params, locals }) => {
	const orgId = orgIdOf(locals);
	const txn = await orgTransaction(orgId, Number(params.id));

	const [[names], files, documents, methods, branches, editForm, attachForm, voidForm] =
		await Promise.all([
			db
				.select({
					method: paymentMethod.name,
					branch: branch.name,
					recordedBy: user.name,
					verifiedBy: verifier.name,
					customer: customer.name
				})
				.from(transactions)
				.leftJoin(customer, eq(customer.id, transactions.customerId))
				.leftJoin(paymentMethod, eq(paymentMethod.id, transactions.paymentMethodId))
				.leftJoin(branch, eq(branch.id, transactions.branchId))
				.leftJoin(user, eq(user.id, transactions.createdBy))
				.leftJoin(verifier, eq(verifier.id, transactions.verifiedBy))
				.where(eq(transactions.id, txn.id)),
			attachmentsOf(orgId, txn.id),
			db
				.select({
					id: stockDocument.id,
					number: stockDocument.number,
					type: stockDocument.type,
					status: stockDocument.status,
					docDate: stockDocument.docDate
				})
				.from(stockDocument)
				.where(and(eq(stockDocument.transactionId, txn.id), eq(stockDocument.orgId, orgId))),
			methodOptions(orgId),
			branchOptions(orgId),
			superValidate(
				{
					direction: txn.direction,
					amount: txn.amount,
					occurredOn: txn.occurredOn,
					paymentMethodId: txn.paymentMethodId ?? 0,
					purpose: txn.purpose,
					receiptNumber: txn.receiptNumber ?? '',
					reference: txn.reference ?? '',
					party: txn.party ?? '',
					description: txn.description ?? '',
					branchId: txn.branchId ?? 0,
					supplierId: txn.supplierId ?? 0,
					customerId: txn.customerId ?? 0,
					withheld: txn.withheld,
					withholdingReceipt: txn.withholdingReceipt ?? ''
				},
				zod4(transactionEdit),
				{ errors: false }
			),
			superValidate(zod4(attachmentAdd)),
			superValidate(zod4(voidSchema))
		]);

	const isRecorder = txn.createdBy === locals.user?.id;

	return {
		txn,
		names,
		files,
		documents,
		methods: [{ value: 0, name: m.sales_not_said_option() }, ...methods],
		branches: [{ value: 0, name: m.sales_whole_business() }, ...branches],
		editForm,
		suppliers: await supplierOptions(orgId),
		customers: await customerChoices(orgId),
		attachForm,
		voidForm,
		canManage: hasPermission(locals, 'transactions.manage'),
		// Maker-checker: whoever recorded it does not verify it, unless they hold everything.
		canVerify: hasPermission(locals, 'transactions.verify') && (!isRecorder || locals.isSuperAdmin),
		isRecorder
	};
};

/** The transaction, if it may still change: not voided, not verified. */
async function editable(event: RequestEvent) {
	requirePermission(event.locals, 'transactions.manage');
	const txn = await orgTransaction(orgIdOf(event.locals), Number(event.params.id));
	const locked =
		txn.status === 'void'
			? m.sales_tx_void_locked()
			: txn.status === 'verified'
				? m.sales_tx_verified_locked()
				: null;
	return { txn, locked };
}

export const actions: Actions = {
	edit: async (event) => {
		const form = await superValidate(event.request, zod4(transactionEdit));
		if (!form.valid)
			return message(form, { type: 'error', text: m.common_check_form() }, { status: 400 });
		const { txn, locked } = await editable(event);
		if (locked) return message(form, { type: 'error', text: locked }, { status: 409 });

		try {
			const values = await checkTransaction(form.data, txn.orgId, txn.id);
			await db.transaction(async (tx) => {
				await tx
					.update(transactions)
					.set({ ...values, updatedBy: event.locals.user?.id })
					.where(eq(transactions.id, txn.id));
				await recordAudit(tx, event, {
					table: 'transactions',
					recordId: txn.id,
					action: 'update',
					before: txn,
					after: values
				});
			});
		} catch (err) {
			if (err instanceof WriteRefused) {
				if (err.field) setError(form, err.field as 'reference', err.message);
				return message(form, { type: 'error', text: err.message }, { status: 400 });
			}
			throw err;
		}
		return message(form, { type: 'success', text: m.common_saved() });
	},

	attach: async (event) => {
		const form = await superValidate(event.request, zod4(attachmentAdd));
		if (!form.valid)
			return message(form, { type: 'error', text: m.sales_choose_screenshot() }, { status: 400 });
		requirePermission(event.locals, 'transactions.manage');
		const txn = await orgTransaction(orgIdOf(event.locals), Number(event.params.id));
		if (txn.status === 'void') {
			return message(form, { type: 'error', text: m.sales_tx_is_void() }, { status: 409 });
		}
		try {
			await addAttachment(db, {
				orgId: txn.orgId,
				transactionId: txn.id,
				file: form.data.file,
				userId: event.locals.user?.id
			});
		} catch (err) {
			const text = err instanceof Error ? err.message : m.sales_file_store_failed();
			return message(form, { type: 'error', text }, { status: 400 });
		}
		return message(form, { type: 'success', text: m.sales_file_attached() });
	},

	/** Files can be taken off while the transaction is still open to change. */
	removeFile: async (event) => {
		const { txn, locked } = await editable(event);
		if (locked) {
			setFlash({ type: 'error', message: locked }, event.cookies);
			return fail(409);
		}
		const fileId = Number((await event.request.formData()).get('fileId'));
		await db
			.update(transactionAttachment)
			.set({ deletedAt: new Date(), deletedBy: event.locals.user?.id ?? null })
			.where(
				and(
					eq(transactionAttachment.id, fileId),
					eq(transactionAttachment.transactionId, txn.id),
					eq(transactionAttachment.orgId, txn.orgId),
					isNull(transactionAttachment.deletedAt)
				)
			);
		setFlash({ type: 'success', message: m.sales_file_removed() }, event.cookies);
		return { removed: true };
	},

	/** Somebody checked the money is really in (or out of) the account. */
	verify: async (event) => {
		requirePermission(event.locals, 'transactions.verify');
		const txn = await orgTransaction(orgIdOf(event.locals), Number(event.params.id));
		if (txn.status !== 'recorded') {
			setFlash(
				{
					type: 'error',
					message: m.sales_tx_is_status({
						status: txn.status === 'void' ? m.sales_tx_status_void() : m.sales_tx_status_verified()
					})
				},
				event.cookies
			);
			return fail(409);
		}
		if (txn.createdBy === event.locals.user?.id && !event.locals.isSuperAdmin) {
			setFlash({ type: 'error', message: m.sales_verify_someone_else() }, event.cookies);
			return fail(403);
		}
		await db
			.update(transactions)
			.set({
				status: 'verified',
				verifiedBy: event.locals.user?.id ?? null,
				verifiedAt: new Date()
			})
			.where(eq(transactions.id, txn.id));
		setFlash({ type: 'success', message: m.sales_verified_done() }, event.cookies);
		return { verified: true };
	},

	/** Transactions are never deleted; a mistake is voided with the reason, and stops counting. */
	void: async (event) => {
		const form = await superValidate(event.request, zod4(voidSchema));
		if (!form.valid)
			return message(form, { type: 'error', text: m.sales_say_why() }, { status: 400 });
		requirePermission(event.locals, 'transactions.manage');
		const txn = await orgTransaction(orgIdOf(event.locals), Number(event.params.id));
		if (txn.status === 'void') {
			return message(form, { type: 'error', text: m.sales_already_void() }, { status: 409 });
		}
		// A verified transaction is a fact someone checked; only an owner may undo it.
		if (txn.status === 'verified' && !event.locals.isSuperAdmin) {
			return message(form, { type: 'error', text: m.sales_only_owner_void() }, { status: 403 });
		}
		await db.transaction(async (tx) => {
			await tx
				.update(transactions)
				.set({ status: 'void', voidReason: form.data.reason, updatedBy: event.locals.user?.id })
				.where(eq(transactions.id, txn.id));
			await recordAudit(tx, event, {
				table: 'transactions',
				recordId: txn.id,
				action: 'update',
				before: txn,
				after: { status: 'void', voidReason: form.data.reason }
			});
		});
		return message(form, { type: 'success', text: m.sales_voided_done() });
	}
};
