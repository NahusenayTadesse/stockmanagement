import { error, fail } from '@sveltejs/kit';
import { and, eq, isNull } from 'drizzle-orm';
import { message, setError, superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { redirect, setFlash } from 'sveltekit-flash-message/server';
import { childActions, childCrud, WriteRefused } from '@nahu/admin-kit/server/childCrud';
import { hasPermission, requirePermission } from '@nahu/admin-kit/server/permissions';
import { localToday } from '@nahu/admin-kit/time';
import { formatETB } from '@nahu/admin-kit/global';
import { db } from '$lib/server/db';
import {
	customer,
	item,
	itemUnit,
	location,
	organization,
	quote,
	quoteLine,
	stockDocument
} from '$lib/server/db/schema';
import { orgIdOf } from '$lib/server/tenant';
import { locationOptions, saleItemOptions, unitOptions } from '$lib/server/options';
import { checkCustomer, customerChoices } from '$lib/server/customers';
import { discountPercent, priceFor } from '$lib/server/pricing';
import { convertQuote, numberQuote, orgQuote, quoteEditable, quoteLines } from '$lib/server/quotes';
import { sendMail } from '$lib/server/mail';
import { StockError } from '$lib/server/stock/post';
import { quoteHeader, quoteLineAdd, quoteLineEdit } from '$lib/schemas/quotes';
import { releaseQuote, reservationsOfQuote, reserveQuote } from '$lib/server/reservations';
import { smsQuote } from '$lib/server/sms';
import { canText, textAction, typedNumber } from '$lib/server/smsActions';
import { m } from '$lib/paraglide/messages.js';
import type { Actions, PageServerLoad, RequestEvent } from './$types';

/**
 * A line, checked: a stock item this business sells, in a unit it has, priced at the customer's
 * price when none is typed — and no deeper below it than the seller may go.
 */
async function lineValues(values: Record<string, unknown>, event: RequestEvent) {
	const orgId = orgIdOf(event.locals);
	const q = await orgQuote(orgId, Number(event.params.id));
	const [it] = await db
		.select()
		.from(item)
		.where(and(eq(item.id, Number(values.itemId)), eq(item.orgId, orgId), isNull(item.deletedAt)));
	// Services and kits are quoted like anything else that is sold.
	if (!it || !it.sellable) {
		throw new WriteRefused('itemId', m.sales_choose_sold_item());
	}
	const uomId = Number(values.uomId) || it.baseUomId;
	if (uomId !== it.baseUomId) {
		const [u] = await db
			.select({ id: itemUnit.id })
			.from(itemUnit)
			.where(
				and(eq(itemUnit.itemId, it.id), eq(itemUnit.uomId, uomId), isNull(itemUnit.deletedAt))
			);
		if (!u) throw new WriteRefused('uomId', m.sales_no_conversion({ name: it.name }));
	}
	const list = await priceFor(orgId, { itemId: it.id, uomId, customerId: q.customerId });
	const unitPrice =
		values.unitPrice === null || values.unitPrice === undefined || values.unitPrice === ''
			? list
			: Number(values.unitPrice);
	if (unitPrice === null) {
		throw new WriteRefused('unitPrice', m.sales_type_price({ name: it.name }));
	}
	const off = discountPercent(list, unitPrice);
	const [org] = await db
		.select({ max: organization.maxDiscountPercent })
		.from(organization)
		.where(eq(organization.id, orgId));
	if (
		off > 0 &&
		org.max !== null &&
		off > org.max &&
		!hasPermission(event.locals, 'sales.discount')
	) {
		throw new WriteRefused('unitPrice', m.sales_discount_over({ off, limit: org.max }));
	}
	return {
		...values,
		orgId,
		uomId,
		unitPrice,
		listPrice: list !== null && list !== unitPrice ? list : null,
		note: values.note || null
	};
}

const lines = childCrud({
	table: quoteLine,
	ownerColumn: 'quoteId',
	label: () => m.common_rec_line(),
	addSchema: quoteLineAdd,
	editSchema: quoteLineEdit,
	permission: 'sales.manage',
	transform: (values, event) => lineValues(values, event as RequestEvent)
});

async function editableOwner(event: RequestEvent) {
	const q = await orgQuote(orgIdOf(event.locals), Number(event.params.id));
	if (!quoteEditable(q.status)) error(409, m.sales_quote_locked());
	return q.id;
}

export const load: PageServerLoad = async ({ params, locals }) => {
	const orgId = orgIdOf(locals);
	const q = await orgQuote(orgId, Number(params.id));
	const editable = quoteEditable(q.status);

	const [section, priced, items, units, customers, locations, [buyer], [sale]] = await Promise.all([
		lines.load(q.id),
		quoteLines(orgId, q.id),
		editable ? saleItemOptions(orgId) : Promise.resolve([]),
		editable ? unitOptions(orgId) : Promise.resolve([]),
		customerChoices(orgId),
		locationOptions(orgId),
		q.customerId
			? db
					.select({
						name: customer.name,
						email: customer.email,
						tin: customer.tin,
						phone: customer.phone
					})
					.from(customer)
					.where(eq(customer.id, q.customerId))
			: Promise.resolve([]),
		q.saleId
			? db
					.select({
						id: stockDocument.id,
						number: stockDocument.number,
						status: stockDocument.status
					})
					.from(stockDocument)
					.where(eq(stockDocument.id, q.saleId))
			: Promise.resolve([])
	]);

	const byId = new Map(priced.lines.map((l) => [l.id, l]));
	const rows = (section.rows as (typeof quoteLine.$inferSelect)[]).map((l) => {
		const p = byId.get(l.id);
		return {
			...l,
			item: p?.item ?? '—',
			unit: p?.unit ?? '—',
			note: l.note ?? '',
			gross: p?.gross ?? 0
		};
	});

	return {
		quote: q,
		buyer: buyer ?? null,
		sale: sale ?? null,
		canText: await canText(locals),
		lines: { ...section, rows },
		totals: priced.totals,
		items,
		units: [{ value: 0, name: m.sales_base_unit() }, ...units],
		customers: customers ?? [],
		locations,
		headerForm: await superValidate(
			{
				customerId: q.customerId ?? 0,
				buyerName: q.buyerName ?? '',
				buyerTin: q.buyerTin ?? '',
				buyerPhone: q.buyerPhone ?? '',
				locationId: q.locationId ?? 0,
				quoteDate: q.quoteDate,
				validUntil: q.validUntil ?? '',
				reference: q.reference ?? '',
				note: q.note ?? '',
				terms: q.terms ?? ''
			},
			zod4(quoteHeader),
			{ errors: false }
		),
		held:
			q.status === 'accepted' || q.status === 'converted'
				? await reservationsOfQuote(orgId, q.id)
				: [],
		reserves: Boolean(
			(
				await db
					.select({ on: organization.reserveStock })
					.from(organization)
					.where(eq(organization.id, orgId))
			)[0]?.on
		),
		expired: Boolean(editable && q.validUntil && q.validUntil < localToday()),
		editable,
		canManage: hasPermission(locals, 'sales.manage'),
		canSell: hasPermission(locals, 'stock.draft')
	};
};

async function setStatus(
	event: RequestEvent,
	status: 'sent' | 'accepted' | 'cancelled',
	text: string
) {
	requirePermission(event.locals, 'sales.manage');
	const orgId = orgIdOf(event.locals);
	const q = await orgQuote(orgId, Number(event.params.id));
	if (!quoteEditable(q.status)) return fail(409);
	await db.transaction(async (tx) => {
		if (status !== 'cancelled') await numberQuote(tx, orgId, q.id);
		await tx
			.update(quote)
			.set({
				status,
				...(status === 'sent' && { sentAt: new Date() }),
				updatedBy: event.locals.user?.id
			})
			.where(eq(quote.id, q.id));
		// Accepted: the stock is held for the buyer (when the business reserves stock). Anything
		// else lets it go again.
		if (status === 'accepted') {
			await reserveQuote(tx, { orgId, quoteId: q.id, userId: event.locals.user?.id });
		} else {
			await releaseQuote(tx, q.id);
		}
	});
	setFlash({ type: 'success', message: text }, event.cookies);
	return { done: true };
}

/** An accepted proforma changed: hold what it now says, where it now says. */
async function reheld(event: RequestEvent) {
	const orgId = orgIdOf(event.locals);
	const q = await orgQuote(orgId, Number(event.params.id));
	if (q.status === 'accepted') {
		await db.transaction((tx) =>
			reserveQuote(tx, { orgId, quoteId: q.id, userId: event.locals.user?.id })
		);
	}
}

/** The line actions, each re-holding the stock of an accepted proforma once it has saved. */
const lineActions = Object.fromEntries(
	Object.entries(childActions({ Line: lines }, editableOwner)).map(([name, action]) => [
		name,
		async (event: RequestEvent) => {
			const result = await action(event);
			await reheld(event);
			return result;
		}
	])
);

export const actions: Actions = {
	/** The proforma's summary — what, how much, until when — by SMS. */
	sms: (event) =>
		textAction(event, m.sales_sms_what_proforma(), (orgId, form) =>
			smsQuote(orgId, Number(event.params.id), {
				to: typedNumber(form),
				userId: event.locals.user?.id
			})
		),

	...lineActions,

	editHeader: async (event) => {
		requirePermission(event.locals, 'sales.manage');
		const orgId = orgIdOf(event.locals);
		const form = await superValidate(event.request, zod4(quoteHeader));
		if (!form.valid)
			return message(form, { type: 'error', text: m.common_check_form() }, { status: 400 });
		const q = await orgQuote(orgId, Number(event.params.id));
		if (!quoteEditable(q.status)) {
			return message(form, { type: 'error', text: m.sales_quote_locked() }, { status: 409 });
		}
		if (form.data.customerId && !(await checkCustomer(orgId, form.data.customerId))) {
			setError(form, 'customerId', m.sales_err_choose_customer());
			return message(form, { type: 'error', text: m.sales_err_choose_customer() }, { status: 400 });
		}
		let branchId = q.branchId;
		if (form.data.locationId) {
			const [loc] = await db
				.select({ branchId: location.branchId })
				.from(location)
				.where(and(eq(location.id, form.data.locationId), eq(location.orgId, orgId)));
			if (!loc) {
				setError(form, 'locationId', m.sales_err_choose_location());
				return message(
					form,
					{ type: 'error', text: m.sales_err_choose_location() },
					{ status: 400 }
				);
			}
			branchId = loc.branchId;
		}
		await db
			.update(quote)
			.set({
				branchId: q.number ? q.branchId : branchId,
				customerId: form.data.customerId || null,
				buyerName: form.data.customerId ? null : form.data.buyerName || null,
				buyerTin: form.data.buyerTin || null,
				buyerPhone: form.data.buyerPhone || null,
				locationId: form.data.locationId || null,
				quoteDate: form.data.quoteDate,
				validUntil: form.data.validUntil || null,
				reference: form.data.reference || null,
				note: form.data.note || null,
				terms: form.data.terms || null,
				updatedBy: event.locals.user?.id
			})
			.where(eq(quote.id, q.id));
		await reheld(event);
		return message(form, { type: 'success', text: m.common_saved() });
	},

	markSent: (event) => setStatus(event, 'sent', m.sales_marked_sent()),
	accept: (event) => setStatus(event, 'accepted', m.sales_accepted_by_buyer()),
	cancel: (event) => setStatus(event, 'cancelled', m.sales_quote_cancelled()),

	/** Emails it to the customer, and marks it sent. */
	email: async (event) => {
		requirePermission(event.locals, 'sales.manage');
		const orgId = orgIdOf(event.locals);
		const q = await orgQuote(orgId, Number(event.params.id));
		const [c] = q.customerId
			? await db
					.select({ name: customer.name, email: customer.email })
					.from(customer)
					.where(eq(customer.id, q.customerId))
			: [];
		if (!c?.email) {
			setFlash({ type: 'error', message: m.sales_no_email_print() }, event.cookies);
			return fail(400);
		}
		const number = await db.transaction((tx) => numberQuote(tx, orgId, q.id));
		const [org] = await db
			.select({ name: organization.name, tin: organization.tin, phone: organization.phone })
			.from(organization)
			.where(eq(organization.id, orgId));
		const priced = await quoteLines(orgId, q.id);
		const sent = await sendMail(
			c.email,
			{
				subject: m.sales_quote_mail_subject({ number, org: org.name }),
				heading: m.sales_quote_mail_heading({ number }),
				body: [
					m.sales_dear({ name: c.name }),
					m.sales_quote_mail_intro({
						reference: q.reference ? ` (${q.reference})` : '',
						valid: q.validUntil ? m.sales_valid_until_part({ date: q.validUntil }) : ''
					})
				],
				table: {
					head: [m.common_item(), m.common_quantity(), m.sales_unit_price(), m.sales_amount()],
					rows: [
						...priced.lines.map((l) => [
							l.item,
							`${l.quantity} ${l.unit}`,
							formatETB(l.unitPrice),
							formatETB(l.net)
						]),
						[m.sales_pos_before_tax(), '', '', formatETB(priced.totals.net)],
						...(priced.totals.vat ? [[m.sales_vat(), '', '', formatETB(priced.totals.vat)]] : []),
						...(priced.totals.tot ? [[m.sales_tot(), '', '', formatETB(priced.totals.tot)]] : []),
						[m.common_total(), '', '', formatETB(priced.totals.gross)]
					]
				},
				footnote: [
					q.terms,
					`${org.name}${org.tin ? `, ${m.sales_tin({ tin: org.tin })}` : ''}${org.phone ? `, ${org.phone}` : ''}`
				]
					.filter(Boolean)
					.join(' · ')
			},
			org.name
		);
		if (!sent) {
			setFlash({ type: 'error', message: m.sales_mail_failed_print() }, event.cookies);
			return fail(502);
		}
		if (q.status === 'draft') {
			await db.update(quote).set({ status: 'sent', sentAt: new Date() }).where(eq(quote.id, q.id));
		}
		setFlash({ type: 'success', message: m.sales_sent_to({ email: c.email }) }, event.cookies);
		return { sent: true };
	},

	/** Makes it a draft sale at the quoted prices, and opens it. */
	convert: async (event) => {
		requirePermission(event.locals, 'sales.manage');
		requirePermission(event.locals, 'stock.draft');
		const orgId = orgIdOf(event.locals);
		const data = await event.request.formData();
		let docId: number;
		try {
			docId = await db.transaction((tx) =>
				convertQuote(tx, {
					orgId,
					quoteId: Number(event.params.id),
					date: localToday(),
					userId: event.locals.user?.id,
					locationId: Number(data.get('locationId')) || undefined
				})
			);
		} catch (err) {
			if (err instanceof StockError) {
				setFlash({ type: 'error', message: err.message }, event.cookies);
				return fail(409, { error: err.message });
			}
			throw err;
		}
		redirect(
			`/dashboard/stock/documents/${docId}`,
			{ type: 'success', message: m.sales_sale_drafted_from_quote() },
			event.cookies
		);
	}
};
