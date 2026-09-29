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
import { itemOptions, locationOptions, unitOptions } from '$lib/server/options';
import { checkCustomer, customerChoices } from '$lib/server/customers';
import { discountPercent, priceFor } from '$lib/server/pricing';
import { convertQuote, numberQuote, orgQuote, quoteEditable, quoteLines } from '$lib/server/quotes';
import { sendMail } from '$lib/server/mail';
import { StockError } from '$lib/server/stock/post';
import { quoteHeader, quoteLineAdd, quoteLineEdit } from '$lib/schemas/quotes';
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
	if (!it || !it.stockTracked || !it.sellable) {
		throw new WriteRefused('itemId', 'Choose an item this business sells.');
	}
	const uomId = Number(values.uomId) || it.baseUomId;
	if (uomId !== it.baseUomId) {
		const [u] = await db
			.select({ id: itemUnit.id })
			.from(itemUnit)
			.where(
				and(eq(itemUnit.itemId, it.id), eq(itemUnit.uomId, uomId), isNull(itemUnit.deletedAt))
			);
		if (!u) throw new WriteRefused('uomId', `${it.name} has no conversion for this unit.`);
	}
	const list = await priceFor(orgId, { itemId: it.id, uomId, customerId: q.customerId });
	const unitPrice =
		values.unitPrice === null || values.unitPrice === undefined || values.unitPrice === ''
			? list
			: Number(values.unitPrice);
	if (unitPrice === null) {
		throw new WriteRefused('unitPrice', `${it.name} has no list price: type the price.`);
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
		throw new WriteRefused('unitPrice', `${off}% off is more than the ${org.max}% you may give.`);
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
	label: 'Line',
	addSchema: quoteLineAdd,
	editSchema: quoteLineEdit,
	permission: 'sales.manage',
	transform: (values, event) => lineValues(values, event as RequestEvent)
});

async function editableOwner(event: RequestEvent) {
	const q = await orgQuote(orgIdOf(event.locals), Number(event.params.id));
	if (!quoteEditable(q.status)) error(409, 'This proforma can no longer change.');
	return q.id;
}

export const load: PageServerLoad = async ({ params, locals }) => {
	const orgId = orgIdOf(locals);
	const q = await orgQuote(orgId, Number(params.id));
	const editable = quoteEditable(q.status);

	const [section, priced, items, units, customers, locations, [buyer], [sale]] = await Promise.all([
		lines.load(q.id),
		quoteLines(orgId, q.id),
		editable ? itemOptions(orgId) : Promise.resolve([]),
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
		lines: { ...section, rows },
		totals: priced.totals,
		items,
		units: [{ value: 0, name: 'Base unit' }, ...units],
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
	});
	setFlash({ type: 'success', message: text }, event.cookies);
	return { done: true };
}

export const actions: Actions = {
	...childActions({ Line: lines }, editableOwner),

	editHeader: async (event) => {
		requirePermission(event.locals, 'sales.manage');
		const orgId = orgIdOf(event.locals);
		const form = await superValidate(event.request, zod4(quoteHeader));
		if (!form.valid)
			return message(form, { type: 'error', text: 'Please check the form' }, { status: 400 });
		const q = await orgQuote(orgId, Number(event.params.id));
		if (!quoteEditable(q.status)) {
			return message(
				form,
				{ type: 'error', text: 'This proforma can no longer change.' },
				{ status: 409 }
			);
		}
		if (form.data.customerId && !(await checkCustomer(orgId, form.data.customerId))) {
			setError(form, 'customerId', 'Choose a customer from the list.');
			return message(
				form,
				{ type: 'error', text: 'Choose a customer from the list.' },
				{ status: 400 }
			);
		}
		let branchId = q.branchId;
		if (form.data.locationId) {
			const [loc] = await db
				.select({ branchId: location.branchId })
				.from(location)
				.where(and(eq(location.id, form.data.locationId), eq(location.orgId, orgId)));
			if (!loc) {
				setError(form, 'locationId', 'Choose a location from the list.');
				return message(
					form,
					{ type: 'error', text: 'Choose a location from the list.' },
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
		return message(form, { type: 'success', text: 'Saved' });
	},

	markSent: (event) => setStatus(event, 'sent', 'Marked as sent'),
	accept: (event) => setStatus(event, 'accepted', 'Accepted by the buyer'),
	cancel: (event) => setStatus(event, 'cancelled', 'Proforma cancelled'),

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
			setFlash(
				{ type: 'error', message: 'The customer has no email address. Print it instead.' },
				event.cookies
			);
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
				subject: `Proforma ${number} from ${org.name}`,
				heading: `Proforma invoice ${number}`,
				body: [
					`Dear ${c.name},`,
					`Our prices for your request${q.reference ? ` (${q.reference})` : ''}${q.validUntil ? `, valid until ${q.validUntil}` : ''}:`
				],
				table: {
					head: ['Item', 'Quantity', 'Unit price', 'Amount'],
					rows: [
						...priced.lines.map((l) => [
							l.item,
							`${l.quantity} ${l.unit}`,
							formatETB(l.unitPrice),
							formatETB(l.net)
						]),
						['Before tax', '', '', formatETB(priced.totals.net)],
						...(priced.totals.vat ? [['VAT', '', '', formatETB(priced.totals.vat)]] : []),
						...(priced.totals.tot ? [['TOT', '', '', formatETB(priced.totals.tot)]] : []),
						['Total', '', '', formatETB(priced.totals.gross)]
					]
				},
				footnote: [
					q.terms,
					`${org.name}${org.tin ? `, TIN ${org.tin}` : ''}${org.phone ? `, ${org.phone}` : ''}`
				]
					.filter(Boolean)
					.join(' · ')
			},
			org.name
		);
		if (!sent) {
			setFlash(
				{ type: 'error', message: 'The email could not be sent. Print it instead.' },
				event.cookies
			);
			return fail(502);
		}
		if (q.status === 'draft') {
			await db.update(quote).set({ status: 'sent', sentAt: new Date() }).where(eq(quote.id, q.id));
		}
		setFlash({ type: 'success', message: `Sent to ${c.email}` }, event.cookies);
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
			{ type: 'success', message: 'Sale drafted from the proforma — check it and post it' },
			event.cookies
		);
	}
};
