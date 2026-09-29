import { m } from '$lib/paraglide/messages.js';
import { error, fail } from '@sveltejs/kit';
import { DOCUMENT_STATUS_LABELS } from '$lib/format';
import { and, asc, eq, isNull, ne } from 'drizzle-orm';
import { alias } from 'drizzle-orm/mysql-core';
import { message, superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { childActions, childCrud, WriteRefused } from '@nahu/admin-kit/server/childCrud';
import { hasPermission, requirePermission } from '@nahu/admin-kit/server/permissions';
import { db } from '$lib/server/db';
import {
	branch,
	customer,
	item,
	landedCost,
	location,
	lot,
	organization,
	purchaseOrder,
	stockDocument,
	stockDocumentLine,
	stockMovement,
	supplier,
	uom,
	user
} from '$lib/server/db/schema';
import { z } from 'zod/v4';
import { LANDED_COST_KINDS, LANDED_COST_METHODS } from '$lib/constants';
import { orgIdOf } from '$lib/server/tenant';
import {
	belongsToOrg,
	itemOptions,
	locationOptions,
	lotOptions,
	saleItemOptions,
	supplierOptions,
	unitOptions
} from '$lib/server/options';
import { supplierSchema } from '$lib/schemas/suppliers';
import {
	customerPicker,
	headerValues,
	lineValues,
	orgDocument,
	recostForeignLines
} from '$lib/server/stock/documents';
import { ApprovalRequired, postDocument, StockError } from '$lib/server/stock/post';
import { receiveTransfer } from '$lib/server/stock/transit';
import {
	approvalState,
	closePendingFor,
	pendingFor,
	requestApproval,
	withdrawApproval
} from '$lib/server/approvals';
import { releaseQuote } from '$lib/server/reservations';
import { branchScope, inScope, locationBranches, requireBranch } from '$lib/server/scope';
import { createReturn, ReturnError, returnable } from '$lib/server/returns';
import { documentTotals } from '$lib/server/tax';
import { afterSale } from '$lib/server/afterSale';
import { smsTransferDispatched } from '$lib/server/sms';
import { deviceFor, printFiscal, recordManualFiscal } from '$lib/server/fiscal';
import { submitEinvoice } from '$lib/server/einvoice';
import QRCode from 'qrcode';
import { localToday } from '@nahu/admin-kit/time';
import { redirect, setFlash } from 'sveltekit-flash-message/server';
import { paymentActions, paymentSection } from '$lib/server/stock/payment';
import { customerStatement } from '$lib/server/credit';
import { documentHeader, lineAdd, lineEdit } from '$lib/schemas/stock';
import { attempt, attemptForm, flashDone, invalidForm } from '$lib/server/actions';
import type { Actions, PageServerLoad, RequestEvent } from './$types';

const lines = childCrud({
	table: stockDocumentLine,
	ownerColumn: 'documentId',
	label: () => m.common_rec_line(),
	addSchema: lineAdd,
	editSchema: lineEdit,
	permission: 'stock.draft',
	transform: async (values, event, before) => {
		const orgId = orgIdOf(event.locals);
		const doc = await orgDocument(orgId, Number(event.params.id));
		// A return's lines are what the original moved; only their quantities change, on the sheet.
		if (doc.type === 'sales_return' || doc.type === 'purchase_return') {
			throw new WriteRefused('itemId', m.stock_err_return_lines());
		}
		// An edited line keeps the order line it delivers; the form does not carry it.
		const withOrderLine = before?.purchaseOrderLineId
			? { ...values, purchaseOrderLineId: before.purchaseOrderLineId }
			: values;
		return lineValues(withOrderLine, orgId, doc);
	}
});

/** A receipt's landed costs: freight, duty and the rest, shared over its lines when it is posted. */
const landedSchema = z.object({
	kind: z.enum(LANDED_COST_KINDS),
	description: z.string().trim().max(160).default(''),
	amount: z.number().positive({ error: () => m.stock_err_amount_birr() }),
	method: z.enum(LANDED_COST_METHODS).default('value'),
	supplierId: z.coerce.number().int().min(0).default(0)
});
const costs = childCrud({
	table: landedCost,
	ownerColumn: 'documentId',
	label: () => m.common_rec_landed_cost(),
	addSchema: landedSchema,
	editSchema: landedSchema.extend({ id: z.coerce.number() }),
	permission: 'stock.draft',
	transform: async (values, event) => {
		const orgId = orgIdOf(event.locals);
		const doc = await orgDocument(orgId, Number(event.params.id));
		if (doc.type !== 'receipt') {
			throw new WriteRefused('kind', m.stock_err_landed_receipts_only());
		}
		if (values.supplierId)
			await belongsToOrg(supplier, values.supplierId, orgId, 'supplierId', 'supplier');
		return {
			...values,
			orgId,
			description: values.description || null,
			supplierId: values.supplierId || null
		};
	}
});

/**
 * The document every line write is filed under: this business's, in the viewer's branches, and
 * still a draft. A posted document's lines are the record of what moved; they are never edited.
 */
async function draftOwner(event: RequestEvent) {
	const doc = await orgDocument(orgIdOf(event.locals), Number(event.params.id));
	await inViewersBranches(event.locals, doc);
	if (doc.status !== 'draft')
		error(
			409,
			m.stock_err_doc_frozen({ status: DOCUMENT_STATUS_LABELS[doc.status] ?? doc.status })
		);
	return doc.id;
}

/** 404 unless the document touches one of the viewer's branches: its own, or where it goes. */
async function inViewersBranches(locals: App.Locals, doc: typeof stockDocument.$inferSelect) {
	const branches = await locationBranches(doc.orgId, [doc.fromLocationId, doc.toLocationId]);
	await requireBranch(
		locals,
		doc.branchId,
		...[doc.fromLocationId, doc.toLocationId].map((id) => (id ? branches.get(id) : null))
	);
	return branches;
}

/**
 * The fiscal receipt and e-invoice of a posted sale or customer return — or null where neither
 * applies (other documents, or a business with no device and e-invoicing off).
 */
async function fiscalPanel(orgId: number, doc: typeof stockDocument.$inferSelect) {
	if (doc.status !== 'posted' || (doc.type !== 'issue' && doc.type !== 'sales_return')) return null;
	const [device, [org]] = await Promise.all([
		deviceFor(orgId, doc.branchId),
		db
			.select({ mode: organization.einvoiceMode })
			.from(organization)
			.where(eq(organization.id, orgId))
	]);
	if (!device && !org?.mode && !doc.fiscalReceiptNumber && !doc.einvoiceIrn) return null;
	return {
		device: device && {
			name: device.name || m.stock_device_number({ id: device.id }),
			kind: device.kind ?? 'manual',
			machineCode: device.machineCode
		},
		einvoiceMode: org?.mode ?? null,
		fsNumber: doc.fiscalReceiptNumber,
		machineCode: doc.fiscalMachineCode,
		fiscalStatus: doc.fiscalStatus,
		fiscalError: doc.fiscalError,
		fiscalPrintedAt: doc.fiscalPrintedAt,
		irn: doc.einvoiceIrn,
		einvoiceStatus: doc.einvoiceStatus,
		einvoiceError: doc.einvoiceError,
		einvoiceSubmittedAt: doc.einvoiceSubmittedAt,
		qr: doc.einvoiceQr ? await QRCode.toDataURL(doc.einvoiceQr, { margin: 1, width: 160 }) : null
	};
}

const fromLoc = alias(location, 'from_loc');
const toLoc = alias(location, 'to_loc');
const poster = alias(user, 'poster');
const receiver = alias(user, 'receiver');

export const load: PageServerLoad = async ({ params, locals }) => {
	const orgId = orgIdOf(locals);
	const doc = await orgDocument(orgId, Number(params.id));
	const branches = await inViewersBranches(locals, doc);
	const scope = await branchScope(locals);

	const [[names], lineSection, items, units, lots, locations, movements, [org]] = await Promise.all(
		[
			db
				.select({
					from: fromLoc.name,
					to: toLoc.name,
					branch: branch.name,
					branchAddress: branch.address,
					branchPhone: branch.phone,
					createdBy: user.name,
					postedBy: poster.name,
					supplier: supplier.name,
					supplierPhone: supplier.phone,
					purchaseOrder: purchaseOrder.number,
					customer: customer.name,
					customerPhone: customer.phone,
					receivedBy: receiver.name
				})
				.from(stockDocument)
				.innerJoin(branch, eq(branch.id, stockDocument.branchId))
				.leftJoin(fromLoc, eq(fromLoc.id, stockDocument.fromLocationId))
				.leftJoin(toLoc, eq(toLoc.id, stockDocument.toLocationId))
				.leftJoin(user, eq(user.id, stockDocument.createdBy))
				.leftJoin(poster, eq(poster.id, stockDocument.postedBy))
				.leftJoin(supplier, eq(supplier.id, stockDocument.supplierId))
				.leftJoin(purchaseOrder, eq(purchaseOrder.id, stockDocument.purchaseOrderId))
				.leftJoin(customer, eq(customer.id, stockDocument.customerId))
				.leftJoin(receiver, eq(receiver.id, stockDocument.receivedBy))
				.where(eq(stockDocument.id, doc.id)),
			lines.load(doc.id),
			// A sale may carry services and kits; everything else moves stock.
			doc.type === 'issue' ? saleItemOptions(orgId) : itemOptions(orgId),
			unitOptions(orgId),
			lotOptions(orgId),
			locationOptions(orgId, scope),
			doc.status === 'posted' || doc.status === 'in_transit'
				? db
						.select({
							id: stockMovement.id,
							kind: stockMovement.kind,
							item: item.name,
							location: location.name,
							lotNumber: lot.lotNumber,
							expiryDate: lot.expiryDate,
							quantity: stockMovement.quantity,
							unit: uom.symbol,
							unitCost: stockMovement.unitCost
						})
						.from(stockMovement)
						.innerJoin(item, eq(item.id, stockMovement.itemId))
						.innerJoin(uom, eq(uom.id, item.baseUomId))
						.innerJoin(location, eq(location.id, stockMovement.locationId))
						.leftJoin(lot, eq(lot.id, stockMovement.lotId))
						.where(and(eq(stockMovement.documentId, doc.id), eq(stockMovement.orgId, orgId)))
						.orderBy(asc(stockMovement.id))
				: Promise.resolve([]),
			db
				.select({ name: organization.name, tin: organization.tin })
				.from(organization)
				.where(eq(organization.id, orgId))
		]
	);

	const itemName = new Map(items.map((i) => [i.value, i.name]));
	const unitName = new Map(units.map((u) => [u.value, u.name]));
	const lotName = new Map(lots.map((l) => [l.value, l.name]));

	const rows = (lineSection.rows as (typeof stockDocumentLine.$inferSelect)[]).map((l) => ({
		...l,
		item: itemName.get(l.itemId) ?? '—',
		unit: unitName.get(l.uomId) ?? '—',
		lotId: l.lotId ?? 0,
		lot: l.lotId ? (lotName.get(l.lotId) ?? '—') : m.stock_fefo(),
		lotNumber: l.lotNumber ?? '',
		expiryDate: l.expiryDate ?? '',
		serials: l.serials ?? ''
	}));

	const headerForm = await superValidate(
		{
			type: doc.type,
			docDate: doc.docDate,
			fromLocationId: doc.fromLocationId ?? 0,
			toLocationId: doc.toLocationId ?? 0,
			supplierId: doc.supplierId ?? 0,
			customerId: doc.customerId ?? 0,
			reference: doc.reference ?? '',
			party: doc.party ?? '',
			reason: doc.reason ?? '',
			note: doc.note ?? '',
			driverName: doc.driverName ?? '',
			vehiclePlate: doc.vehiclePlate ?? '',
			currency: doc.currency ?? '',
			exchangeRate: doc.exchangeRate
		},
		zod4(documentHeader),
		{ errors: false }
	);

	// What it comes to — before VAT, VAT, total — and, while a draft sale to a named customer, where
	// it leaves them.
	const totals = await documentTotals(orgId, doc.id);
	const priced = (lineSection.rows as (typeof stockDocumentLine.$inferSelect)[]).filter(
		(l) => l.unitPrice !== null
	);
	const saleValue = doc.type === 'issue' && priced.length ? (totals?.gross ?? null) : null;
	const isReturn = doc.type === 'sales_return' || doc.type === 'purchase_return';

	// Returns: what is left to return on the original, and the returns made against this one.
	const [returnLeft, returnsMade, [original]] = await Promise.all([
		isReturn && doc.returnOfId ? returnable(orgId, doc.returnOfId) : Promise.resolve([]),
		!isReturn && (doc.type === 'issue' || doc.type === 'receipt')
			? db
					.select({
						id: stockDocument.id,
						number: stockDocument.number,
						status: stockDocument.status,
						docDate: stockDocument.docDate
					})
					.from(stockDocument)
					.where(and(eq(stockDocument.returnOfId, doc.id), ne(stockDocument.status, 'cancelled')))
			: Promise.resolve([]),
		doc.returnOfId
			? db
					.select({ id: stockDocument.id, number: stockDocument.number })
					.from(stockDocument)
					.where(eq(stockDocument.id, doc.returnOfId))
			: Promise.resolve([])
	]);
	const canReturn =
		doc.status === 'posted' &&
		(doc.type === 'issue' || doc.type === 'receipt') &&
		(await returnable(orgId, doc.id)).some((r) => r.left > 0);
	const lineTotals = new Map((totals?.lines ?? []).map((l) => [l.id, l]));
	const returnSheet = isReturn
		? rows.map((l) => {
				const left = returnLeft.find(
					(r) => r.lineId === l.returnOfLineId && (r.lotId ?? 0) === (l.lotId || 0)
				);
				return {
					id: l.id,
					item: l.item,
					unit: l.unit,
					lot: l.lotNumber,
					quantity: l.quantity,
					serials: l.serials,
					left: left?.left ?? 0,
					serialsLeft: left?.serialsLeft ?? [],
					price: doc.type === 'sales_return' ? l.unitPrice : l.unitCost,
					gross: lineTotals.get(l.id)?.gross ?? 0
				};
			})
		: [];
	const credit =
		doc.type === 'issue' && doc.status === 'draft' && doc.customerId
			? await customerStatement(orgId, doc.customerId)
			: null;

	// A transfer to another branch: what was sent, and — once received — what arrived.
	const trackSerials = new Set(
		(
			await db
				.select({ id: item.id })
				.from(item)
				.where(and(eq(item.orgId, orgId), eq(item.trackSerials, true)))
		).map((i) => i.id)
	);
	const transit =
		doc.type === 'transfer' && (doc.status === 'in_transit' || doc.receivedAt)
			? {
					canReceive:
						doc.status === 'in_transit' &&
						hasPermission(locals, 'stock.post') &&
						inScope(scope, doc.toLocationId ? branches.get(doc.toLocationId) : null),
					lines: rows.map((l) => ({
						id: l.id,
						item: l.item,
						unit: l.unit,
						sent: l.quantity,
						received: l.receivedQuantity,
						serials: l.serials,
						receivedSerials: l.receivedSerials ?? '',
						trackSerials: trackSerials.has(l.itemId)
					}))
				}
			: null;

	// Receipts: freight, duty and the rest, shared over the lines when posted.
	let landed = null;
	if (doc.type === 'receipt') {
		const [section, payees] = await Promise.all([costs.load(doc.id), supplierOptions(orgId)]);
		const payee = new Map(payees.map((p) => [p.value, p.name]));
		landed = {
			...section,
			rows: (section.rows as (typeof landedCost.$inferSelect)[]).map((c) => ({
				...c,
				description: c.description ?? '',
				supplierId: c.supplierId ?? 0,
				supplier: c.supplierId ? (payee.get(c.supplierId) ?? '—') : ''
			})),
			suppliers: [{ value: 0, name: '— None —' }, ...payees],
			total:
				Math.round(
					(section.rows as (typeof landedCost.$inferSelect)[]).reduce((s, c) => s + c.amount, 0) *
						100
				) / 100
		};
	}

	// Maker-checker on adjustments: what is waiting, or why it was turned down.
	const approval =
		doc.type === 'adjustment' && doc.status === 'draft'
			? await approvalState(orgId, { kind: 'adjustment', documentId: doc.id })
			: null;

	return {
		doc,
		names,
		saleValue,
		totals: totals && { net: totals.net, vat: totals.vat, tot: totals.tot, gross: totals.gross },
		returnSheet,
		returnsMade,
		original: original ?? null,
		canReturn,
		fiscal: await fiscalPanel(orgId, doc),
		unpriced: doc.type === 'issue' ? lineSection.rows.length - priced.length : 0,
		credit: credit && {
			balance: credit.balance,
			overdue: credit.overdue,
			creditLimit: credit.creditLimit
		},
		org,
		transit,
		landed,
		approval,
		lines: { ...lineSection, rows },
		items,
		units: [{ value: 0, name: m.stock_base_unit() }, ...units],
		lots: [{ value: 0, name: m.stock_fefo() }, ...lots],
		locations,
		destinations:
			doc.type === 'transfer' && doc.status === 'draft' ? await locationOptions(orgId) : null,
		movements,
		headerForm,
		pay: await paymentSection(orgId, doc, locals),
		suppliers: doc.status === 'draft' ? await supplierOptions(orgId) : [],
		supplierForm:
			doc.status === 'draft' && hasPermission(locals, 'suppliers.manage')
				? await superValidate(zod4(supplierSchema))
				: undefined,
		...(doc.status === 'draft' && doc.type === 'issue'
			? await customerPicker(orgId, locals)
			: { customers: null, customerForm: undefined }),
		canDraft: hasPermission(locals, 'stock.draft'),
		canPost: hasPermission(locals, 'stock.post')
	};
};

export const actions: Actions = {
	...childActions({ Line: lines, Cost: costs }, draftOwner),
	...paymentActions,

	editHeader: async (event) => {
		requirePermission(event.locals, 'stock.draft');
		const orgId = orgIdOf(event.locals);
		const form = await superValidate(event.request, zod4(documentHeader));
		if (!form.valid) return invalidForm(form);
		const doc = await orgDocument(orgId, Number(event.params.id));
		await inViewersBranches(event.locals, doc);
		if (doc.status !== 'draft') {
			return message(form, { type: 'error', text: m.stock_only_draft_changes() }, { status: 409 });
		}
		// A return keeps who it is from or to: that is the original's.
		const keep =
			doc.type === 'sales_return' || doc.type === 'purchase_return'
				? { supplierId: doc.supplierId, customerId: doc.customerId, party: doc.party }
				: {};

		return attemptForm(form, async () => {
			// The type stays what it was: the lines were entered for it.
			const values = {
				...(await headerValues(
					orgId,
					{ ...form.data, type: doc.type },
					{ allowReturn: true, scope: await branchScope(event.locals) }
				)),
				...keep
			};
			await db
				.update(stockDocument)
				.set({ ...values, updatedBy: event.locals.user?.id })
				.where(eq(stockDocument.id, doc.id));
			// A new rate (or no currency any more) re-costs the lines priced in that currency.
			if (values.exchangeRate !== doc.exchangeRate || values.currency !== doc.currency) {
				await recostForeignLines(doc.id, values.currency ? values.exchangeRate : null);
			}
			return m.common_saved();
		});
	},

	/** Posts the draft: the moment stock changes. All lines or none. */
	post: async (event) => {
		requirePermission(event.locals, 'stock.post');
		const orgId = orgIdOf(event.locals);
		const documentId = Number(event.params.id);
		await inViewersBranches(event.locals, await orgDocument(orgId, documentId));

		// Something other than a refusal went wrong: nothing was posted, and the person is told so.
		let broke = false;
		const answer = await attempt(event, async () => {
			let posted;
			try {
				posted = await db.transaction((tx) =>
					postDocument(tx, {
						orgId,
						documentId,
						userId: event.locals.user?.id,
						allowOverLimit: hasPermission(event.locals, 'customers.credit')
					})
				);
			} catch (err) {
				// Over the business's limits: not refused, but it waits for someone else.
				if (err instanceof ApprovalRequired) {
					await requestApproval({
						orgId,
						userId: event.locals.user?.id,
						subject: { kind: 'adjustment', documentId },
						refusal: err
					});
					return m.stock_sent_for_approval({ reason: err.reason });
				}
				if (err instanceof StockError) throw err;
				console.error('posting failed', err);
				broke = true;
				return null;
			}
			const { number, status, warnings } = posted;
			// Fiscal receipt and e-invoice, when set up: after the commit, never undoing it.
			const { notes, failed } = await afterSale(orgId, documentId, {
				userId: event.locals.user?.id
			});
			// A transfer on its way: the receiving branch (and the alert numbers) are told.
			if (status === 'in_transit') await smsTransferDispatched(orgId, documentId);
			const text = [
				status === 'in_transit' ? m.stock_dispatched_as({ number }) : m.stock_posted_as({ number }),
				...warnings,
				...notes
			].join(' · ');
			// Posted, but something wants attention (a short shelf life, a device that did not print).
			if (failed || warnings.length) {
				setFlash({ type: 'error', message: text }, event.cookies);
				return null;
			}
			return text;
		});
		if (broke) {
			setFlash({ type: 'error', message: m.stock_posting_failed() }, event.cookies);
			return fail(500);
		}
		return answer;
	},

	/** A draft return of what is left on this sale or receipt, opened for the storekeeper. */
	startReturn: async (event) => {
		requirePermission(event.locals, 'stock.draft');
		const orgId = orgIdOf(event.locals);
		let id = 0;
		const answer = await attempt(event, async () => {
			try {
				id = await db.transaction((tx) =>
					createReturn(tx, {
						orgId,
						documentId: Number(event.params.id),
						date: localToday(),
						userId: event.locals.user?.id
					})
				);
			} catch (err) {
				// Nothing left to return, a draft already open: a refusal like any other.
				if (err instanceof ReturnError) throw new StockError(err.message);
				throw err;
			}
			return null;
		});
		if (!id) return answer;
		redirect(
			`/dashboard/stock/documents/${id}`,
			{
				type: 'success',
				message: m.stock_return_drafted()
			},
			event.cookies
		);
	},

	/** The return sheet: quantities (and, for serial items, which serials) actually coming back. */
	saveReturn: async (event) => {
		requirePermission(event.locals, 'stock.draft');
		const orgId = orgIdOf(event.locals);
		const doc = await orgDocument(orgId, Number(event.params.id));
		if (doc.status !== 'draft' || (doc.type !== 'sales_return' && doc.type !== 'purchase_return')) {
			return fail(409);
		}
		const data = await event.request.formData();
		const docLines = await db
			.select()
			.from(stockDocumentLine)
			.where(and(eq(stockDocumentLine.documentId, doc.id), isNull(stockDocumentLine.deletedAt)));

		await db.transaction(async (tx) => {
			for (const l of docLines) {
				const serialsField = data.get(`serials_${l.id}`);
				const serials =
					serialsField === null
						? null
						: String(serialsField)
								.split(/[\n,]/)
								.map((x) => x.trim())
								.filter(Boolean);
				const quantity = serials ? serials.length : Number(data.get(`qty_${l.id}`) ?? l.quantity);
				if (!Number.isFinite(quantity) || quantity < 0) continue;
				if (quantity === 0) {
					await tx
						.update(stockDocumentLine)
						.set({ deletedAt: new Date(), deletedBy: event.locals.user?.id ?? null })
						.where(eq(stockDocumentLine.id, l.id));
				} else {
					await tx
						.update(stockDocumentLine)
						.set({ quantity, ...(serials && { serials: serials.join('\n') }) })
						.where(eq(stockDocumentLine.id, l.id));
				}
			}
		});
		flashDone(event, m.stock_return_saved());
		return { done: true };
	},

	/** Prints the fiscal receipt on the branch's device (or retries a failed one). */
	printFiscal: async (event) => {
		requirePermission(event.locals, 'stock.post');
		const r = await printFiscal(orgIdOf(event.locals), Number(event.params.id));
		setFlash(
			r.ok
				? {
						type: 'success',
						message: r.fsNumber
							? m.stock_fiscal_printed_fs({ fs: r.fsNumber })
							: m.stock_fiscal_ring_it_up()
					}
				: { type: 'error', message: r.error },
			event.cookies
		);
		return r.ok ? { printed: true } : fail(502, { fiscalError: r.error });
	},

	/** The FS No. (and machine code) of a receipt the device printed on its own. */
	recordFiscal: async (event) => {
		requirePermission(event.locals, 'stock.post');
		const data = await event.request.formData();
		const fsNumber = String(data.get('fsNumber') ?? '').trim();
		const machineCode = String(data.get('machineCode') ?? '').trim();
		if (!/^[\w-]{1,30}$/.test(fsNumber)) {
			setFlash({ type: 'error', message: m.stock_fiscal_enter_fs() }, event.cookies);
			return fail(400);
		}
		const doc = await orgDocument(orgIdOf(event.locals), Number(event.params.id));
		if (doc.status !== 'posted') return fail(409);
		await recordManualFiscal(orgIdOf(event.locals), doc.id, {
			fsNumber,
			machineCode: machineCode.slice(0, 30) || doc.fiscalMachineCode
		});
		setFlash(
			{ type: 'success', message: m.stock_fiscal_recorded({ fs: fsNumber }) },
			event.cookies
		);
		return { recorded: true };
	},

	/** Sends (or re-sends) the e-invoice. */
	submitEinvoice: async (event) => {
		requirePermission(event.locals, 'stock.post');
		const r = await submitEinvoice(orgIdOf(event.locals), Number(event.params.id));
		setFlash(
			r.ok
				? { type: 'success', message: m.stock_einvoice_accepted_irn({ irn: r.irn }) }
				: { type: 'error', message: r.error },
			event.cookies
		);
		return r.ok ? { sent: true } : fail(502, { einvoiceError: r.error });
	},

	/** The receiving branch says what arrived; the rest is written off as lost in transit. */
	receive: async (event) => {
		requirePermission(event.locals, 'stock.post');
		const orgId = orgIdOf(event.locals);
		const doc = await orgDocument(orgId, Number(event.params.id));
		const branches = await locationBranches(orgId, [doc.toLocationId]);
		// Only the branch it is going to can say it arrived.
		await requireBranch(event.locals, doc.toLocationId ? branches.get(doc.toLocationId) : null);
		const data = await event.request.formData();
		const docLines = await db
			.select({ id: stockDocumentLine.id })
			.from(stockDocumentLine)
			.where(and(eq(stockDocumentLine.documentId, doc.id), isNull(stockDocumentLine.deletedAt)));
		const arrivals = docLines.map((l) => {
			const serials = data.get(`serials_${l.id}`);
			return {
				lineId: l.id,
				quantity: Number(data.get(`qty_${l.id}`) ?? 0),
				serials:
					serials === null
						? null
						: String(serials)
								.split(/[\n,]/)
								.map((x) => x.trim())
								.filter(Boolean)
			};
		});
		return attempt(event, async () => {
			const { lost } = await db.transaction((tx) =>
				receiveTransfer(tx, {
					orgId,
					documentId: doc.id,
					userId: event.locals.user?.id,
					arrivals,
					note: String(data.get('note') ?? '').trim() || null
				})
			);
			if (!lost.length) return m.stock_received_in_full();
			// Received, but not all of it: that wants attention.
			setFlash(
				{
					type: 'error',
					message: m.stock_received_lost({
						lost: lost.map((l) => `${l.quantity} ${l.item}`).join(', ')
					})
				},
				event.cookies
			);
			return null;
		});
	},

	/** The requester takes back an adjustment waiting for approval, to change it. */
	withdraw: async (event) => {
		requirePermission(event.locals, 'stock.draft');
		const orgId = orgIdOf(event.locals);
		const doc = await orgDocument(orgId, Number(event.params.id));
		const pending = await pendingFor(orgId, { kind: 'adjustment', documentId: doc.id });
		if (!pending) return fail(409);
		return attempt(event, async () => {
			await db.transaction((tx) =>
				withdrawApproval(tx, { orgId, requestId: pending.id, userId: event.locals.user!.id })
			);
			return m.stock_approval_withdrawn();
		});
	},

	/** A draft that will not be posted. Kept, not deleted, so its number range has no mystery gaps. */
	cancel: async (event) => {
		requirePermission(event.locals, 'stock.post');
		const doc = await orgDocument(orgIdOf(event.locals), Number(event.params.id));
		await inViewersBranches(event.locals, doc);
		if (doc.status !== 'draft') {
			setFlash({ type: 'error', message: m.stock_only_draft_cancel() }, event.cookies);
			return fail(409);
		}
		await db.transaction(async (tx) => {
			await tx
				.update(stockDocument)
				.set({ status: 'cancelled', updatedBy: event.locals.user?.id })
				.where(eq(stockDocument.id, doc.id));
			// A sale made from a proforma is not going ahead: nothing is held for it any more.
			if (doc.type === 'issue' && doc.quoteId) await releaseQuote(tx, doc.quoteId);
		});
		// Nothing left to approve.
		if (doc.type === 'adjustment') {
			await closePendingFor(doc.orgId, { kind: 'adjustment', documentId: doc.id });
		}
		flashDone(event, m.stock_draft_cancelled());
		return { done: true };
	}
};
