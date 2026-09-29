import { smsPaymentReceived } from '$lib/server/sms';
import { message, setError, superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { redirect } from 'sveltekit-flash-message/server';
import { WriteRefused } from '@nahu/admin-kit/server/childCrud';
import { hasPermission, requirePermission } from '@nahu/admin-kit/server/permissions';
import { localToday } from '@nahu/admin-kit/time';
import { db } from '$lib/server/db';
import { transactions } from '$lib/server/db/schema';
import { orgIdOf } from '$lib/server/tenant';
import { branchOptions, methodOptions, supplierOptions } from '$lib/server/options';
import { customerChoices } from '$lib/server/customers';
import {
	addAttachment,
	checkTransaction,
	datePresets,
	parseFilters,
	totalsByMethod,
	transactionList,
	transactionTotals
} from '$lib/server/transactions';
import { transactionAdd } from '$lib/schemas/transactions';
import { invalidForm } from '$lib/server/actions';
import { m } from '$lib/paraglide/messages.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	const orgId = orgIdOf(locals);
	const today = localToday();
	const filters = parseFilters(url, today);

	const [rows, totals, byMethod, methods, branches, form] = await Promise.all([
		transactionList(orgId, filters),
		transactionTotals(orgId, filters),
		totalsByMethod(orgId, filters),
		methodOptions(orgId),
		branchOptions(orgId),
		superValidate({ occurredOn: today }, zod4(transactionAdd), { errors: false })
	]);

	return {
		rows,
		totals,
		byMethod,
		filters,
		presets: datePresets(today),
		methods: [{ value: 0, name: m.sales_not_said_option() }, ...methods],
		branches: [{ value: 0, name: m.sales_whole_business() }, ...branches],
		form,
		suppliers: await supplierOptions(orgId),
		customers: await customerChoices(orgId),
		canManage: hasPermission(locals, 'transactions.manage')
	};
};

export const actions: Actions = {
	add: async (event) => {
		requirePermission(event.locals, 'transactions.manage');
		const orgId = orgIdOf(event.locals);
		const form = await superValidate(event.request, zod4(transactionAdd));
		if (!form.valid) return invalidForm(form);

		let id: number;
		try {
			const values = await checkTransaction(form.data, orgId);
			id = await db.transaction(async (tx) => {
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
				return row.id;
			});
		} catch (err) {
			if (err instanceof WriteRefused) {
				if (err.field) setError(form, err.field as 'reference', err.message);
				return message(form, { type: 'error', text: err.message }, { status: 400 });
			}
			console.error('transaction add failed', err);
			const text =
				err instanceof Error && /file/i.test(err.message)
					? err.message
					: m.sales_tx_record_failed();
			return message(form, { type: 'error', text }, { status: 500 });
		}
		await smsPaymentReceived(orgId, id, event.locals.user?.id);

		redirect(
			`/dashboard/transactions/${id}`,
			{ type: 'success', message: m.sales_tx_recorded({ id }) },
			event.cookies
		);
	}
};
