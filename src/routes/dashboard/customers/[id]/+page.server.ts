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
import { remindCustomer, resultNote, sendSms, smsLog, smsPaymentReceived } from '$lib/server/sms';
import { canText, textAction, typedNumber } from '$lib/server/smsActions';
import { methodOptions, priceListOptions } from '$lib/server/options';
import { sendMail } from '$lib/server/mail';
import { localToday } from '@nahu/admin-kit/time';
import { formatETB } from '@nahu/admin-kit/global';
import { WriteRefused } from '@nahu/admin-kit/server/childCrud';
import { fail } from '@sveltejs/kit';
import { setFlash } from 'sveltekit-flash-message/server';
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
		methods: [{ value: 0, name: '— Not said —' }, ...methods],
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
		if (!form.valid)
			return message(form, { type: 'error', text: 'Please check the form' }, { status: 400 });

		const before = await orgCustomer(orgId, Number(event.params.id));
		const after = { ...customerValues(form.data), isActive: form.data.status };
		if (await duplicateCustomer(orgId, after.name, after.phone, before.id)) {
			setError(form, 'name', 'Another customer already has this name and phone.');
			return message(
				form,
				{ type: 'error', text: 'That customer is already on the list.' },
				{ status: 409 }
			);
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
		return message(form, { type: 'success', text: 'Customer saved' });
	},

	/** Money in from the customer, against what they owe. Applied to their oldest sales first. */
	receivePayment: async (event) => {
		requirePermission(event.locals, 'transactions.manage');
		const orgId = orgIdOf(event.locals);
		const c = await orgCustomer(orgId, Number(event.params.id));
		const form = await superValidate(event.request, zod4(receivePayment));
		if (!form.valid)
			return message(form, { type: 'error', text: 'Please check the form' }, { status: 400 });

		let transactionId: number;
		try {
			const values = await checkTransaction(
				{ ...form.data, direction: 'in', purpose: 'sale', customerId: c.id, party: c.name },
				orgId
			);
			[{ id: transactionId }] = await db
				.insert(transactions)
				.values({ ...values, orgId, createdBy: event.locals.user?.id })
				.$returningId();
		} catch (err) {
			if (err instanceof WriteRefused) {
				if (err.field) setError(form, err.field as 'reference', err.message);
				return message(form, { type: 'error', text: err.message }, { status: 400 });
			}
			throw err;
		}
		// A text confirming it, when the business sends them.
		const sms = await smsPaymentReceived(orgId, transactionId, event.locals.user?.id);
		const note = sms && resultNote(sms, c.phone ?? '');
		return message(form, {
			type: 'success',
			text: `${formatETB(form.data.amount)} received from ${c.name}${note ? ` · ${note}` : ''}`
		});
	},

	/** A text of what they owe and how much of it is late. */
	smsRemind: (event) =>
		textAction(event, 'Reminder', async (orgId, form) => {
			const c = await orgCustomer(orgId, Number(event.params.id));
			return remindCustomer(orgId, c.id, { userId: event.locals.user?.id, to: typedNumber(form) });
		}),

	/** A message written to the customer. */
	smsText: (event) =>
		textAction(event, 'Message', async (orgId, form) => {
			const c = await orgCustomer(orgId, Number(event.params.id));
			const text = String(form.get('text') ?? '').trim();
			if (!text) return { ok: false, status: 'skipped', error: 'Write the message.' };
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
			setFlash({ type: 'error', message: `${c.name} has no email address.` }, event.cookies);
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
				subject: `Your account with ${org.name}: ${formatETB(Math.max(0, s.balance))} due`,
				heading: 'Account statement',
				body: [
					`Dear ${c.name},`,
					s.balance > 0
						? `You owe ${formatETB(s.balance)}${s.overdue > 0 ? `, of which ${formatETB(s.overdue)} is overdue` : ''}. The purchases not yet paid are below.`
						: 'Your account is fully paid. Thank you.'
				],
				table: s.open.length
					? {
							head: ['Purchase', 'Date', 'Due', 'Still owed'],
							rows: s.open.map((o) => [
								o.number ?? `#${o.id}`,
								o.docDate,
								o.dueDate + (o.daysOverdue > 0 ? ` (${o.daysOverdue} days late)` : ''),
								formatETB(o.remaining)
							])
						}
					: undefined,
				footnote: `${org.name}${org.phone ? `, ${org.phone}` : ''}. Please quote the purchase numbers when you pay.`
			},
			org.name
		);
		setFlash(
			sent
				? { type: 'success', message: `Statement sent to ${c.email}` }
				: { type: 'error', message: 'The email could not be sent. Print the statement instead.' },
			event.cookies
		);
		return sent ? { sent: true } : fail(502);
	}
};
