import { error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { redirect } from 'sveltekit-flash-message/server';
import { childActions, childCrud } from '@nahu/admin-kit/server/childCrud';
import { hasPermission, requirePermission } from '@nahu/admin-kit/server/permissions';
import { localToday } from '@nahu/admin-kit/time';
import { formatETB } from '@nahu/admin-kit/global';
import { db } from '$lib/server/db';
import { organization, purchaseOrder, purchaseOrderLine, user } from '$lib/server/db/schema';
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
import { branchScope, requireBranch } from '$lib/server/scope';
import { orderHeader, orderLineAdd, orderLineEdit } from '$lib/schemas/purchasing';
import { supplierSchema } from '$lib/schemas/suppliers';
import { smsOrder } from '$lib/server/sms';
import { m } from '$lib/paraglide/messages.js';
import { PO_STATUS_LABELS } from '$lib/schemas/purchasing';
import { canText, textAction, typedNumber } from '$lib/server/smsActions';
import { attempt, attemptForm, invalidForm } from '$lib/server/actions';
import { pickedStore, pickedSupplier } from '$lib/server/checks';
import type { Actions, PageServerLoad, RequestEvent } from './$types';

const lines = childCrud({
	table: purchaseOrderLine,
	ownerColumn: 'purchaseOrderId',
	label: () => m.common_rec_line(),
	addSchema: orderLineAdd,
	editSchema: orderLineEdit,
	permission: 'purchasing.manage',
	transform: async (values, event) => orderLineValues(values, orgIdOf(event.locals))
});

/** Lines change only while the order is a draft: once sent, the supplier is working from them. */
async function draftOwner(event: RequestEvent) {
	const order = await scopedOrder(event);
	if (order.status !== 'draft') error(409, m.purchasing_po_lines_locked());
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
		canText: await canText(locals),
		createdBy: people?.createdBy ?? null,
		lines: { ...lineSection, rows },
		items,
		units: [{ value: 0, name: m.purchasing_base_unit() }, ...units],
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

export const actions: Actions = {
	/** The order, short enough for a text, to the supplier's phone. */
	sms: async (event) => {
		requirePermission(event.locals, 'purchasing.manage');
		return textAction(event, m.purchasing_sms_what_order(), (orgId, form) =>
			smsOrder(orgId, Number(event.params.id), {
				to: typedNumber(form),
				userId: event.locals.user?.id
			})
		);
	},

	...childActions({ Line: lines }, draftOwner),

	editHeader: async (event) => {
		requirePermission(event.locals, 'purchasing.manage');
		const orgId = orgIdOf(event.locals);
		const form = await superValidate(event.request, zod4(orderHeader));
		if (!form.valid) return invalidForm(form);
		const order = await scopedOrder(event);

		return attemptForm(form, async () => {
			if (order.status !== 'draft') throw new StockError(m.purchasing_po_only_draft_changes());
			const sup = await pickedSupplier(
				orgId,
				form.data.supplierId,
				m.purchasing_v_supplier_from_list()
			);
			const loc = await pickedStore(
				event.locals,
				orgId,
				form.data.locationId,
				m.purchasing_v_location_from_list()
			);

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
			return m.common_saved();
		});
	},

	/** Sent to the supplier: the order gets its number and its lines are fixed. */
	markOrdered: async (event) => {
		requirePermission(event.locals, 'purchasing.manage');
		const orgId = orgIdOf(event.locals);
		const order = await scopedOrder(event);
		return attempt(event, async () => {
			try {
				const number = await db.transaction((tx) =>
					markOrdered(tx, { orgId, orderId: order.id, userId: event.locals.user?.id })
				);
				return m.purchasing_po_ordered_as({ number });
			} catch (err) {
				// Over the business's limit: it waits for a second person instead.
				if (!(err instanceof ApprovalRequired)) throw err;
				await requestApproval({
					orgId,
					userId: event.locals.user?.id,
					subject: { kind: 'purchase_order', purchaseOrderId: order.id },
					refusal: err
				});
				return m.purchasing_po_sent_for_approval({ reason: err.reason });
			}
		});
	},

	/** A draft goods receipt for what is still due, opened for the storekeeper to check and post. */
	receive: async (event) => {
		requirePermission(event.locals, 'stock.draft');
		const orgId = orgIdOf(event.locals);
		await scopedOrder(event);
		return attempt(event, async () => {
			const documentId = await db.transaction((tx) =>
				receiptFromOrder(tx, {
					orgId,
					orderId: Number(event.params.id),
					date: localToday(),
					userId: event.locals.user?.id
				})
			);
			redirect(
				`/dashboard/stock/documents/${documentId}`,
				{ type: 'success', message: m.purchasing_po_receipt_drafted() },
				event.cookies
			);
		});
	},

	/** Emails the order to the supplier. */
	email: async (event) => {
		requirePermission(event.locals, 'purchasing.manage');
		const orgId = orgIdOf(event.locals);
		await scopedOrder(event);
		return attempt(event, async () => {
			const { order, details, lines } = await orderForSupplier(orgId, Number(event.params.id));
			if (order.status === 'draft' || order.status === 'cancelled') {
				throw new StockError(m.purchasing_po_email_only_placed());
			}
			if (!details.supplierEmail) {
				throw new StockError(m.purchasing_po_supplier_no_email({ supplier: details.supplier }));
			}
			const [org] = await db
				.select({ name: organization.name, tin: organization.tin })
				.from(organization)
				.where(eq(organization.id, orgId));

			const total = lines.reduce((s, l) => s + l.value, 0);
			const sent = await sendMail(
				details.supplierEmail,
				{
					subject: m.purchasing_mail_subject({ number: order.number ?? '', org: org.name }),
					heading: m.purchasing_mail_heading({ number: order.number ?? '' }),
					body: [
						m.purchasing_mail_dear({ supplier: details.supplier }),
						m.purchasing_mail_intro({
							org: org.name,
							place: `${details.location} (${details.branch}${details.branchAddress ? `, ${details.branchAddress}` : ''})`
						}),
						...(order.expectedDate ? [m.purchasing_mail_expect({ date: order.expectedDate })] : []),
						...(order.note ? [order.note] : [])
					],
					table: {
						head: [
							m.purchasing_mail_col_item(),
							m.purchasing_mail_col_quantity(),
							m.purchasing_mail_col_unit_price(),
							m.purchasing_mail_col_amount()
						],
						rows: [
							...lines.map((l) => [
								l.item,
								`${l.quantity} ${l.unit}`,
								l.unitPrice == null ? '' : formatETB(l.unitPrice),
								l.unitPrice == null ? '' : formatETB(l.value)
							]),
							[m.purchasing_mail_total(), '', '', formatETB(total)]
						]
					},
					footnote: [
						org.tin ? `${org.name}, TIN ${org.tin}.` : org.name,
						details.branchPhone ? m.purchasing_mail_questions({ phone: details.branchPhone }) : '',
						m.purchasing_mail_quote_number()
					]
						.filter(Boolean)
						.join(' ')
				},
				org.name
			);
			if (!sent) throw new StockError(m.purchasing_mail_failed());
			return m.purchasing_mail_sent({ email: details.supplierEmail });
		});
	},

	/** Nothing more is coming: what was delivered stands, the rest is no longer expected. */
	close: async (event) => {
		requirePermission(event.locals, 'purchasing.manage');
		return attempt(event, async () => {
			const order = await scopedOrder(event);
			if (order.status !== 'ordered' && order.status !== 'partially_received') {
				throw new StockError(m.purchasing_po_only_open_close());
			}
			await db
				.update(purchaseOrder)
				.set({ status: 'closed', updatedBy: event.locals.user?.id })
				.where(eq(purchaseOrder.id, order.id));
			return m.purchasing_po_closed();
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
						? m.purchasing_po_part_arrived()
						: m.purchasing_po_is({ status: PO_STATUS_LABELS[order.status].toLowerCase() })
				);
			}
			const receipts = await orderReceipts(orgId, order.id);
			if (receipts.length) throw new StockError(m.purchasing_po_receipt_open());
			await db
				.update(purchaseOrder)
				.set({ status: 'cancelled', updatedBy: event.locals.user?.id })
				.where(eq(purchaseOrder.id, order.id));
			await closePendingFor(orgId, { kind: 'purchase_order', purchaseOrderId: order.id });
			return m.purchasing_po_cancelled();
		});
	}
};
