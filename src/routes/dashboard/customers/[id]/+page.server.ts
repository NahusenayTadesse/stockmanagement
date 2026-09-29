import { eq } from 'drizzle-orm';
import { message, setError, superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { hasPermission, requirePermission } from '@nahu/admin-kit/server/permissions';
import { recordAudit } from '@nahu/admin-kit/server/audit';
import { db } from '$lib/server/db';
import { customer, organization, transactions } from '$lib/server/db/schema';
import { orgIdOf } from '$lib/server/tenant';
import {
	customerDetail,
	customerValues,
	duplicateCustomer,
	orgCustomer
} from '$lib/server/customers';
import { customerEdit, receivePayment } from '$lib/schemas/customers';
import { customerStatement } from '$lib/server/credit';
import { checkTransaction } from '$lib/server/transactions';
import { remindCustomer, sendSms, smsLog, smsPaymentReceived } from '$lib/server/sms';
import { smsNote } from '$lib/server/afterSale';
import { canText, textAction, typedNumber } from '$lib/server/smsActions';
import { methodOptions, priceListOptions } from '$lib/server/options';
import { sendMail } from '$lib/server/mail';
import { localToday } from '@nahu/admin-kit/time';
import { formatETB } from '@nahu/admin-kit/global';
import { fail } from '@sveltejs/kit';
import { setFlash } from 'sveltekit-flash-message/server';
import { m } from '$lib/paraglide/messages.js';
import { attemptForm, invalidForm } from '$lib/server/actions';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
	const orgId = orgIdOf(locals);
	const c = await orgCustomer(orgId, Number(params.id));
	const canReceive = hasPermission(locals, 'transactions.manage');
	const [detail, statement, form, paymentForm, methods] = await Promise.all([
		customerDetail(orgId, c.id),
		customerStatement(orgId, c.id),
		superValidate(
			{
				name: c.name,
				phone: c.phone ?? '',
				email: c.email ?? '',
				address: c.address ?? '',
				tin: c.tin ?? '',
				note: c.note ?? '',
				creditLimit: c.creditLimit,
				creditDays: c.creditDays,
				withholdsTax: c.withholdsTax,
				priceListId: c.priceListId ?? 0,
				status: c.isActive
			},
			zod4(customerEdit),
			{ errors: false }
		),
		superValidate({ occurredOn: localToday() }, zod4(receivePayment), { errors: false }),
		canReceive ? methodOptions(orgId) : Promise.resolve([])
	]);
	const { lines, ...position } = statement;
	return {
		customer: c,
		...detail,
		credit: { ...position, recent: lines.slice(-8).reverse() },
		form,
		paymentForm,
		methods: [{ value: 0, name: m.sales_not_said_option() }, ...methods],
		priceLists: await priceListOptions(orgId),
		canManage: hasPermission(locals, 'customers.manage'),
		canReceive,
		canText: await canText(locals),
		texts: await smsLog(orgId, { customerId: c.id })
	};
};

export const actions: Actions = {
	/** Details, and active/inactive: an inactive customer keeps its history but leaves the pickers. */
	edit: async (event) => {
		requirePermission(event.locals, 'customers.manage');
		const orgId = orgIdOf(event.locals);
		const form = await superValidate(event.request, zod4(customerEdit));
		if (!form.valid) return invalidForm(form);

		const before = await orgCustomer(orgId, Number(event.params.id));
		const after = { ...customerValues(form.data), isActive: form.data.status };
		if (await duplicateCustomer(orgId, after.name, after.phone, before.id)) {
			setError(form, 'name', m.sales_another_same_name());
			return message(form, { type: 'error', text: m.sales_already_on_list() }, { status: 409 });
		}

		await db.transaction(async (tx) => {
			await tx
				.update(customer)
				.set({ ...after, updatedBy: event.locals.user?.id })
				.where(eq(customer.id, before.id));
			await recordAudit(tx, event, {
				table: 'customer',
				recordId: before.id,
				action: 'update',
				before,
				after
			});
		});
		return message(form, { type: 'success', text: m.sales_customer_saved() });
	},

	/** Money in from the customer, against what they owe. Applied to their oldest sales first. */
	receivePayment: async (event) => {
		requirePermission(event.locals, 'transactions.manage');
		const orgId = orgIdOf(event.locals);
		const c = await orgCustomer(orgId, Number(event.params.id));
		const form = await superValidate(event.request, zod4(receivePayment));
		if (!form.valid) return invalidForm(form);

		return attemptForm(form, async () => {
			const values = await checkTransaction(
				{ ...form.data, direction: 'in', purpose: 'sale', customerId: c.id, party: c.name },
				orgId
			);
			const [{ id: transactionId }] = await db
				.insert(transactions)
				.values({ ...values, orgId, createdBy: event.locals.user?.id })
				.$returningId();
			// A text confirming it, when the business sends them.
			const sms = await smsPaymentReceived(orgId, transactionId, event.locals.user?.id);
			const note = sms && smsNote(sms, c.phone ?? '');
			return `${m.sales_received_from({ amount: formatETB(form.data.amount), name: c.name })}${note ? ` · ${note}` : ''}`;
		});
	},

	/** A text of what they owe and how much of it is late. */
	smsRemind: (event) =>
		textAction(event, m.sales_sms_what_reminder(), async (orgId, form) => {
			const c = await orgCustomer(orgId, Number(event.params.id));
			return remindCustomer(orgId, c.id, { userId: event.locals.user?.id, to: typedNumber(form) });
		}),

	/** A message written to the customer. */
	smsText: (event) =>
		textAction(event, m.sales_sms_what_message(), async (orgId, form) => {
			const c = await orgCustomer(orgId, Number(event.params.id));
			const text = String(form.get('text') ?? '').trim();
			if (!text) return { ok: false, status: 'skipped', error: m.sales_write_message() };
			return sendSms(orgId, {
				to: typedNumber(form) ?? c.phone,
				text: text.slice(0, 300),
				kind: 'custom',
				customerId: c.id,
				link: `/dashboard/customers/${c.id}`,
				userId: event.locals.user?.id
			});
		}),

	/** The statement, by email, to a customer who left an address. */
	emailStatement: async (event) => {
		requirePermission(event.locals, 'customers.manage');
		const orgId = orgIdOf(event.locals);
		const c = await orgCustomer(orgId, Number(event.params.id));
		if (!c.email) {
			setFlash(
				{ type: 'error', message: m.sales_no_email_address({ name: c.name }) },
				event.cookies
			);
			return fail(400);
		}
		const [org] = await db
			.select({ name: organization.name, phone: organization.phone })
			.from(organization)
			.where(eq(organization.id, orgId));
		const s = await customerStatement(orgId, c.id);
		const sent = await sendMail(
			c.email,
			{
				subject: m.sales_statement_subject({
					org: org.name,
					amount: formatETB(Math.max(0, s.balance))
				}),
				heading: m.sales_account_statement(),
				body: [
					m.sales_dear({ name: c.name }),
					s.balance > 0
						? m.sales_you_owe({
								amount: formatETB(s.balance),
								overdue:
									s.overdue > 0 ? m.sales_of_which_overdue({ amount: formatETB(s.overdue) }) : ''
							})
						: m.sales_account_paid()
				],
				table: s.open.length
					? {
							head: [m.sales_purchase(), m.common_date(), m.sales_due(), m.sales_still_owed()],
							rows: s.open.map((o) => [
								o.number ?? `#${o.id}`,
								o.docDate,
								o.dueDate +
									(o.daysOverdue > 0 ? m.sales_days_late_paren({ days: o.daysOverdue }) : ''),
								formatETB(o.remaining)
							])
						}
					: undefined,
				footnote: m.sales_quote_numbers({
					org: org.name,
					phone: org.phone ? `, ${org.phone}` : ''
				})
			},
			org.name
		);
		setFlash(
			sent
				? { type: 'success', message: m.sales_statement_sent({ email: c.email }) }
				: { type: 'error', message: m.sales_statement_mail_failed() },
			event.cookies
		);
		return sent ? { sent: true } : fail(502);
	}
};
