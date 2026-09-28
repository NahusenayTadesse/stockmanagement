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
	paymentMethod,
	stockDocument,
	transactionAttachment,
	transactions,
	user
} from '$lib/server/db/schema';
import { orgIdOf } from '$lib/server/tenant';
import { branchOptions, methodOptions, supplierOptions } from '$lib/server/options';
import {
	addAttachment,
	attachmentsOf,
	checkTransaction,
	orgTransaction
} from '$lib/server/transactions';
import { attachmentAdd, transactionEdit, voidSchema } from '$lib/schemas/transactions';
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
					verifiedBy: verifier.name
				})
				.from(transactions)
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
					supplierId: txn.supplierId ?? 0
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
		methods: [{ value: 0, name: '— Not said —' }, ...methods],
		branches: [{ value: 0, name: 'Whole business' }, ...branches],
		editForm,
		suppliers: await supplierOptions(orgId),
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
			? 'This transaction is void and can no longer change.'
			: txn.status === 'verified'
				? 'This transaction has been verified and can no longer change.'
				: null;
	return { txn, locked };
}

export const actions: Actions = {
	edit: async (event) => {
		const form = await superValidate(event.request, zod4(transactionEdit));
		if (!form.valid)
			return message(form, { type: 'error', text: 'Please check the form' }, { status: 400 });
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
		return message(form, { type: 'success', text: 'Saved' });
	},

	attach: async (event) => {
		const form = await superValidate(event.request, zod4(attachmentAdd));
		if (!form.valid)
			return message(form, { type: 'error', text: 'Choose a screenshot or PDF' }, { status: 400 });
		requirePermission(event.locals, 'transactions.manage');
		const txn = await orgTransaction(orgIdOf(event.locals), Number(event.params.id));
		if (txn.status === 'void') {
			return message(form, { type: 'error', text: 'This transaction is void.' }, { status: 409 });
		}
		try {
			await addAttachment(db, {
				orgId: txn.orgId,
				transactionId: txn.id,
				file: form.data.file,
				userId: event.locals.user?.id
			});
		} catch (err) {
			const text = err instanceof Error ? err.message : 'Could not store the file.';
			return message(form, { type: 'error', text }, { status: 400 });
		}
		return message(form, { type: 'success', text: 'File attached' });
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
		setFlash({ type: 'success', message: 'File removed' }, event.cookies);
		return { removed: true };
	},

	/** Somebody checked the money is really in (or out of) the account. */
	verify: async (event) => {
		requirePermission(event.locals, 'transactions.verify');
		const txn = await orgTransaction(orgIdOf(event.locals), Number(event.params.id));
		if (txn.status !== 'recorded') {
			setFlash({ type: 'error', message: `This transaction is ${txn.status}.` }, event.cookies);
			return fail(409);
		}
		if (txn.createdBy === event.locals.user?.id && !event.locals.isSuperAdmin) {
			setFlash(
				{ type: 'error', message: 'Someone other than the person who recorded it must verify it.' },
				event.cookies
			);
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
		setFlash({ type: 'success', message: 'Verified' }, event.cookies);
		return { verified: true };
	},

	/** Transactions are never deleted; a mistake is voided with the reason, and stops counting. */
	void: async (event) => {
		const form = await superValidate(event.request, zod4(voidSchema));
		if (!form.valid) return message(form, { type: 'error', text: 'Say why' }, { status: 400 });
		requirePermission(event.locals, 'transactions.manage');
		const txn = await orgTransaction(orgIdOf(event.locals), Number(event.params.id));
		if (txn.status === 'void') {
			return message(form, { type: 'error', text: 'Already void.' }, { status: 409 });
		}
		// A verified transaction is a fact someone checked; only an owner may undo it.
		if (txn.status === 'verified' && !event.locals.isSuperAdmin) {
			return message(
				form,
				{ type: 'error', text: 'Only an owner can void a verified transaction.' },
				{ status: 403 }
			);
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
		return message(form, { type: 'success', text: 'Voided' });
	}
};
