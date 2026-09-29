import { error, fail } from '@sveltejs/kit';
import { and, eq, isNull } from 'drizzle-orm';
import { message, setError, superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { redirect, setFlash } from 'sveltekit-flash-message/server';
import { childActions, childCrud } from '@nahu/admin-kit/server/childCrud';
import { hasPermission, requirePermission } from '@nahu/admin-kit/server/permissions';
import { localToday } from '@nahu/admin-kit/time';
import { formatETB } from '@nahu/admin-kit/global';
import { db } from '$lib/server/db';
import {
	location,
	organization,
	purchaseOrder,
	purchaseOrderLine,
	supplier,
	user
} from '$lib/server/db/schema';
import { orgIdOf } from '$lib/server/tenant';
import { itemOptions, locationOptions, supplierOptions, unitOptions } from '$lib/server/options';
import { sendMail } from '$lib/server/mail';
import {
	markOrdered,
	orderForSupplier,
	orderLines,
	orderReceipts,
	orgOrder,
	receiptFromOrder
} from '$lib/server/purchasing';
import { orderLineValues } from '$lib/server/orderLines';
import { ApprovalRequired, StockError } from '$lib/server/stock/post';
import { approvalState, closePendingFor, requestApproval } from '$lib/server/approvals';
import { branchScope, inScope, requireBranch } from '$lib/server/scope';
import { orderHeader, orderLineAdd, orderLineEdit } from '$lib/schemas/purchasing';
import { supplierSchema } from '$lib/schemas/suppliers';
import type { Actions, PageServerLoad, RequestEvent } from './$types';

const lines = childCrud({
	table: purchaseOrderLine,
	ownerColumn: 'purchaseOrderId',
	label: 'Line',
	addSchema: orderLineAdd,
	editSchema: orderLineEdit,
	permission: 'purchasing.manage',
	transform: async (values, event) => orderLineValues(values, orgIdOf(event.locals))
});

/** Lines change only while the order is a draft: once sent, the supplier is working from them. */
async function draftOwner(event: RequestEvent) {
	const order = await scopedOrder(event);
	if (order.status !== 'draft')
		error(409, 'This order has been sent and its lines can no longer change.');
	return order.id;
}

/** This business's order, in one of the viewer's branches — to anyone else it does not exist. */
async function scopedOrder(event: Pick<RequestEvent, 'locals' | 'params'>) {
	const order = await orgOrder(orgIdOf(event.locals), Number(event.params.id));
	await requireBranch(event.locals, order.branchId);
	return order;
}

export const load: PageServerLoad = async ({ params, locals }) => {
	const orgId = orgIdOf(locals);
	const order = await scopedOrder({ params, locals });
	const isDraft = order.status === 'draft';

	const [{ details }, lineSection, detailed, receipts, items, units, [people]] = await Promise.all([
		orderForSupplier(orgId, order.id),
		lines.load(order.id),
		orderLines(orgId, order.id),
		orderReceipts(orgId, order.id),
		isDraft ? itemOptions(orgId) : Promise.resolve([]),
		isDraft ? unitOptions(orgId) : Promise.resolve([]),
		db
			.select({ createdBy: user.name })
			.from(purchaseOrder)
			.leftJoin(user, eq(user.id, purchaseOrder.createdBy))
			.where(eq(purchaseOrder.id, order.id))
	]);

	const byId = new Map(detailed.map((l) => [l.id, l]));
	const rows = (lineSection.rows as (typeof purchaseOrderLine.$inferSelect)[]).map((l) => {
		const d = byId.get(l.id);
		return {
			...l,
			item: d?.item ?? '—',
			unit: d?.unit ?? '—',
			note: l.note ?? '',
			received: d?.received ?? 0,
			due: d?.due ?? 0,
			value: d?.value ?? 0
		};
	});

	const canManage = hasPermission(locals, 'purchasing.manage');
	return {
		order,
		details,
		createdBy: people?.createdBy ?? null,
		lines: { ...lineSection, rows },
		items,
		units: [{ value: 0, name: 'Base unit' }, ...units],
		receipts,
		total: Math.round(detailed.reduce((s, l) => s + l.value, 0) * 100) / 100,
		headerForm: await superValidate(
			{
				supplierId: order.supplierId,
				locationId: order.locationId,
				orderDate: order.orderDate,
				expectedDate: order.expectedDate ?? '',
				reference: order.reference ?? '',
				note: order.note ?? ''
			},
			zod4(orderHeader),
			{ errors: false }
		),
		suppliers: isDraft && canManage ? await supplierOptions(orgId) : [],
		locations: isDraft && canManage ? await locationOptions(orgId, await branchScope(locals)) : [],
		approval: isDraft
			? await approvalState(orgId, { kind: 'purchase_order', purchaseOrderId: order.id })
			: { pending: null, last: null },
		supplierForm:
			isDraft && canManage && hasPermission(locals, 'suppliers.manage')
				? await superValidate(zod4(supplierSchema))
				: undefined,
		canManage,
		canReceive: hasPermission(locals, 'stock.draft')
	};
};

/** Runs a state change, turning refusals into a flash message. */
async function attempt(event: RequestEvent, run: () => Promise<string>) {
	try {
		const text = await run();
		setFlash({ type: 'success', message: text }, event.cookies);
		return { done: true };
	} catch (err) {
		if (err instanceof StockError) {
			setFlash({ type: 'error', message: err.message }, event.cookies);
			return fail(409, { refused: err.message });
		}
		throw err;
	}
}

export const actions: Actions = {
	...childActions({ Line: lines }, draftOwner),

	editHeader: async (event) => {
		requirePermission(event.locals, 'purchasing.manage');
		const orgId = orgIdOf(event.locals);
		const form = await superValidate(event.request, zod4(orderHeader));
		if (!form.valid)
			return message(form, { type: 'error', text: 'Please check the form' }, { status: 400 });
		const order = await scopedOrder(event);
		if (order.status !== 'draft') {
			return message(
				form,
				{ type: 'error', text: 'Only a draft order can change.' },
				{ status: 409 }
			);
		}

		const [[sup], [loc]] = await Promise.all([
			db
				.select({ id: supplier.id })
				.from(supplier)
				.where(
					and(
						eq(supplier.id, form.data.supplierId),
						eq(supplier.orgId, orgId),
						isNull(supplier.deletedAt)
					)
				),
			db
				.select({ id: location.id, branchId: location.branchId })
				.from(location)
				.where(
					and(
						eq(location.id, form.data.locationId),
						eq(location.orgId, orgId),
						isNull(location.deletedAt)
					)
				)
		]);
		if (!sup) {
			setError(form, 'supplierId', 'Choose a supplier from the list.');
			return message(
				form,
				{ type: 'error', text: 'Choose a supplier from the list.' },
				{ status: 400 }
			);
		}
		if (!loc || !inScope(await branchScope(event.locals), loc.branchId)) {
			setError(form, 'locationId', 'Choose a location from the list.');
			return message(
				form,
				{ type: 'error', text: 'Choose a location from the list.' },
				{ status: 400 }
			);
		}

		await db
			.update(purchaseOrder)
			.set({
				supplierId: sup.id,
				locationId: loc.id,
				branchId: loc.branchId,
				orderDate: form.data.orderDate,
				expectedDate: form.data.expectedDate || null,
				reference: form.data.reference || null,
				note: form.data.note || null,
				updatedBy: event.locals.user?.id
			})
			.where(eq(purchaseOrder.id, order.id));
		return message(form, { type: 'success', text: 'Saved' });
	},

	/** Sent to the supplier: the order gets its number and its lines are fixed. */
	markOrdered: async (event) => {
		requirePermission(event.locals, 'purchasing.manage');
		const orgId = orgIdOf(event.locals);
		const order = await scopedOrder(event);
		try {
			const number = await db.transaction((tx) =>
				markOrdered(tx, { orgId, orderId: order.id, userId: event.locals.user?.id })
			);
			setFlash({ type: 'success', message: `Ordered as ${number}` }, event.cookies);
			return { done: true };
		} catch (err) {
			// Over the business's limit: it waits for a second person instead.
			if (err instanceof ApprovalRequired) {
				await requestApproval({
					orgId,
					userId: event.locals.user?.id,
					subject: { kind: 'purchase_order', purchaseOrderId: order.id },
					refusal: err
				});
				setFlash(
					{
						type: 'success',
						message: `Sent for approval: ${err.reason}. It is ordered once someone else approves it.`
					},
					event.cookies
				);
				return { sentForApproval: true };
			}
			if (err instanceof StockError) {
				setFlash({ type: 'error', message: err.message }, event.cookies);
				return fail(409, { refused: err.message });
			}
			throw err;
		}
	},

	/** A draft goods receipt for what is still due, opened for the storekeeper to check and post. */
	receive: async (event) => {
		requirePermission(event.locals, 'stock.draft');
		const orgId = orgIdOf(event.locals);
		await scopedOrder(event);
		let documentId: number;
		try {
			documentId = await db.transaction((tx) =>
				receiptFromOrder(tx, {
					orgId,
					orderId: Number(event.params.id),
					date: localToday(),
					userId: event.locals.user?.id
				})
			);
		} catch (err) {
			if (err instanceof StockError) {
				setFlash({ type: 'error', message: err.message }, event.cookies);
				return fail(409, { refused: err.message });
			}
			throw err;
		}
		redirect(
			`/dashboard/stock/documents/${documentId}`,
			{
				type: 'success',
				message:
					'Receipt drafted from the order — correct the quantities to what arrived, then post'
			},
			event.cookies
		);
	},

	/** Emails the order to the supplier. */
	email: async (event) => {
		requirePermission(event.locals, 'purchasing.manage');
		const orgId = orgIdOf(event.locals);
		await scopedOrder(event);
		const { order, details, lines } = await orderForSupplier(orgId, Number(event.params.id));
		if (order.status === 'draft' || order.status === 'cancelled') {
			setFlash(
				{ type: 'error', message: 'Only an order that has been placed can be emailed.' },
				event.cookies
			);
			return fail(409);
		}
		if (!details.supplierEmail) {
			setFlash(
				{
					type: 'error',
					message: `${details.supplier} has no email address. Add one on the supplier's page.`
				},
				event.cookies
			);
			return fail(400);
		}
		const [org] = await db
			.select({ name: organization.name, tin: organization.tin })
			.from(organization)
			.where(eq(organization.id, orgId));

		const total = lines.reduce((s, l) => s + l.value, 0);
		const sent = await sendMail(
			details.supplierEmail,
			{
				subject: `Purchase order ${order.number} from ${org.name}`,
				heading: `Purchase order ${order.number}`,
				body: [
					`Dear ${details.supplier},`,
					`${org.name} would like to order the following, delivered to ${details.location} (${details.branch}${details.branchAddress ? `, ${details.branchAddress}` : ''}).`,
					...(order.expectedDate ? [`We expect delivery by ${order.expectedDate}.`] : []),
					...(order.note ? [order.note] : [])
				],
				table: {
					head: ['Item', 'Quantity', 'Unit price', 'Amount'],
					rows: [
						...lines.map((l) => [
							l.item,
							`${l.quantity} ${l.unit}`,
							l.unitPrice == null ? '' : formatETB(l.unitPrice),
							l.unitPrice == null ? '' : formatETB(l.value)
						]),
						['Total', '', '', formatETB(total)]
					]
				},
				footnote: [
					org.tin ? `${org.name}, TIN ${org.tin}.` : org.name,
					details.branchPhone ? `Questions: ${details.branchPhone}.` : '',
					'Please quote the order number on your delivery note and invoice.'
				]
					.filter(Boolean)
					.join(' ')
			},
			org.name
		);
		if (!sent) {
			setFlash(
				{ type: 'error', message: 'The email could not be sent. Try again, or print the order.' },
				event.cookies
			);
			return fail(502);
		}
		setFlash({ type: 'success', message: `Emailed to ${details.supplierEmail}` }, event.cookies);
		return { emailed: true };
	},

	/** Nothing more is coming: what was delivered stands, the rest is no longer expected. */
	close: async (event) => {
		requirePermission(event.locals, 'purchasing.manage');
		return attempt(event, async () => {
			const order = await scopedOrder(event);
			if (order.status !== 'ordered' && order.status !== 'partially_received') {
				throw new StockError('Only an open order can be closed.');
			}
			await db
				.update(purchaseOrder)
				.set({ status: 'closed', updatedBy: event.locals.user?.id })
				.where(eq(purchaseOrder.id, order.id));
			return 'Order closed; what is still due is no longer expected';
		});
	},

	/** Called off before anything arrived. */
	cancel: async (event) => {
		requirePermission(event.locals, 'purchasing.manage');
		const orgId = orgIdOf(event.locals);
		return attempt(event, async () => {
			const order = await scopedOrder(event);
			if (order.status !== 'draft' && order.status !== 'ordered') {
				throw new StockError(
					order.status === 'partially_received'
						? 'Part of this order has arrived; close it instead.'
						: `This order is ${order.status}.`
				);
			}
			const receipts = await orderReceipts(orgId, order.id);
			if (receipts.length)
				throw new StockError('A receipt is open against this order; cancel it first.');
			await db
				.update(purchaseOrder)
				.set({ status: 'cancelled', updatedBy: event.locals.user?.id })
				.where(eq(purchaseOrder.id, order.id));
			await closePendingFor(orgId, { kind: 'purchase_order', purchaseOrderId: order.id });
			return 'Order cancelled';
		});
	}
};
