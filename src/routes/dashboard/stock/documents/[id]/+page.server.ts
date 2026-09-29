import { error, fail } from '@sveltejs/kit';
import { and, asc, eq, isNull, ne } from 'drizzle-orm';
import { alias } from 'drizzle-orm/mysql-core';
import { message, setError, superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { childActions, childCrud, WriteRefused } from '@nahu/admin-kit/server/childCrud';
import { hasPermission, requirePermission } from '@nahu/admin-kit/server/permissions';
import { db } from '$lib/server/db';
import {
	branch,
	customer,
	item,
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
import { orgIdOf } from '$lib/server/tenant';
import {
	itemOptions,
	locationOptions,
	lotOptions,
	supplierOptions,
	unitOptions
} from '$lib/server/options';
import { supplierSchema } from '$lib/schemas/suppliers';
import { customerPicker, headerValues, lineValues, orgDocument } from '$lib/server/stock/documents';
import { postDocument, StockError } from '$lib/server/stock/post';
import { createReturn, ReturnError, returnable } from '$lib/server/returns';
import { documentTotals } from '$lib/server/tax';
import { afterSale } from '$lib/server/afterSale';
import { deviceFor, printFiscal, recordManualFiscal } from '$lib/server/fiscal';
import { submitEinvoice } from '$lib/server/einvoice';
import QRCode from 'qrcode';
import { localToday } from '@nahu/admin-kit/time';
import { redirect, setFlash } from 'sveltekit-flash-message/server';
import { paymentActions, paymentSection } from '$lib/server/stock/payment';
import { customerStatement } from '$lib/server/credit';
import { documentHeader, lineAdd, lineEdit } from '$lib/schemas/stock';
import type { Actions, PageServerLoad, RequestEvent } from './$types';

const lines = childCrud({
	table: stockDocumentLine,
	ownerColumn: 'documentId',
	label: 'Line',
	addSchema: lineAdd,
	editSchema: lineEdit,
	permission: 'stock.draft',
	transform: async (values, event, before) => {
		const orgId = orgIdOf(event.locals);
		const doc = await orgDocument(orgId, Number(event.params.id));
		// A return's lines are what the original moved; only their quantities change, on the sheet.
		if (doc.type === 'sales_return' || doc.type === 'purchase_return') {
			throw new WriteRefused(
				'itemId',
				'A return lists what the original moved. Change quantities on the return sheet.'
			);
		}
		// An edited line keeps the order line it delivers; the form does not carry it.
		const withOrderLine = before?.purchaseOrderLineId
			? { ...values, purchaseOrderLineId: before.purchaseOrderLineId }
			: values;
		return lineValues(withOrderLine, orgId, doc);
	}
});

/**
 * The document every line write is filed under: this business's, and still a draft. A posted
 * document's lines are the record of what moved; they are never edited.
 */
async function draftOwner(event: RequestEvent) {
	const doc = await orgDocument(orgIdOf(event.locals), Number(event.params.id));
	if (doc.status !== 'draft')
		error(409, `This document is ${doc.status} and can no longer change.`);
	return doc.id;
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
			name: device.name || `Device #${device.id}`,
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

export const load: PageServerLoad = async ({ params, locals }) => {
	const orgId = orgIdOf(locals);
	const doc = await orgDocument(orgId, Number(params.id));

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
					customerPhone: customer.phone
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
				.where(eq(stockDocument.id, doc.id)),
			lines.load(doc.id),
			itemOptions(orgId),
			unitOptions(orgId),
			lotOptions(orgId),
			locationOptions(orgId),
			doc.status === 'posted'
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
		lot: l.lotId ? (lotName.get(l.lotId) ?? '—') : 'First expiry first out',
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
			note: doc.note ?? ''
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
		lines: { ...lineSection, rows },
		items,
		units: [{ value: 0, name: 'Base unit' }, ...units],
		lots: [{ value: 0, name: 'First expiry first out' }, ...lots],
		locations,
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
	...childActions({ Line: lines }, draftOwner),
	...paymentActions,

	editHeader: async (event) => {
		requirePermission(event.locals, 'stock.draft');
		const orgId = orgIdOf(event.locals);
		const form = await superValidate(event.request, zod4(documentHeader));
		if (!form.valid) {
			return message(form, { type: 'error', text: 'Please check the form' }, { status: 400 });
		}
		const doc = await orgDocument(orgId, Number(event.params.id));
		if (doc.status !== 'draft') {
			return message(form, { type: 'error', text: 'Only a draft can change.' }, { status: 409 });
		}
		// A return keeps who it is from or to: that is the original's.
		const keep =
			doc.type === 'sales_return' || doc.type === 'purchase_return'
				? { supplierId: doc.supplierId, customerId: doc.customerId, party: doc.party }
				: {};

		try {
			// The type stays what it was: the lines were entered for it.
			const values = {
				...(await headerValues(orgId, { ...form.data, type: doc.type }, { allowReturn: true })),
				...keep
			};
			await db
				.update(stockDocument)
				.set({ ...values, updatedBy: event.locals.user?.id })
				.where(eq(stockDocument.id, doc.id));
		} catch (err) {
			if (err instanceof WriteRefused) {
				if (err.field)
					setError(form, err.field as 'toLocationId' | 'supplierId' | 'customerId', err.message);
				return message(form, { type: 'error', text: err.message }, { status: 400 });
			}
			throw err;
		}
		return message(form, { type: 'success', text: 'Saved' });
	},

	/** Posts the draft: the moment stock changes. All lines or none. */
	post: async (event) => {
		requirePermission(event.locals, 'stock.post');
		const orgId = orgIdOf(event.locals);
		const documentId = Number(event.params.id);

		try {
			const { number } = await db.transaction((tx) =>
				postDocument(tx, {
					orgId,
					documentId,
					userId: event.locals.user?.id,
					allowOverLimit: hasPermission(event.locals, 'customers.credit')
				})
			);
			// Fiscal receipt and e-invoice, when set up: after the commit, never undoing it.
			const { notes, failed } = await afterSale(orgId, documentId);
			setFlash(
				{
					type: failed ? 'error' : 'success',
					message: [`Posted as ${number}`, ...notes].join(' · ')
				},
				event.cookies
			);
			return { posted: number };
		} catch (err) {
			if (err instanceof StockError) {
				setFlash({ type: 'error', message: err.message }, event.cookies);
				return fail(409, { stockError: err.message, lineId: err.lineId ?? null });
			}
			console.error('posting failed', err);
			setFlash({ type: 'error', message: 'Posting failed. Nothing was changed.' }, event.cookies);
			return fail(500);
		}
	},

	/** A draft return of what is left on this sale or receipt, opened for the storekeeper. */
	startReturn: async (event) => {
		requirePermission(event.locals, 'stock.draft');
		const orgId = orgIdOf(event.locals);
		let id: number;
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
			if (err instanceof ReturnError) {
				setFlash({ type: 'error', message: err.message }, event.cookies);
				return fail(409, { stockError: err.message });
			}
			throw err;
		}
		redirect(
			`/dashboard/stock/documents/${id}`,
			{
				type: 'success',
				message: 'Return drafted with everything returnable — lower it to what is coming back'
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
		setFlash({ type: 'success', message: 'Return quantities saved' }, event.cookies);
		return { saved: true };
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
							? `Fiscal receipt FS No. ${r.fsNumber}`
							: 'Ring it up on the device, then enter its FS No.'
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
			setFlash({ type: 'error', message: 'Enter the FS No. as printed.' }, event.cookies);
			return fail(400);
		}
		const doc = await orgDocument(orgIdOf(event.locals), Number(event.params.id));
		if (doc.status !== 'posted') return fail(409);
		await recordManualFiscal(orgIdOf(event.locals), doc.id, {
			fsNumber,
			machineCode: machineCode.slice(0, 30) || doc.fiscalMachineCode
		});
		setFlash({ type: 'success', message: `FS No. ${fsNumber} recorded` }, event.cookies);
		return { recorded: true };
	},

	/** Sends (or re-sends) the e-invoice. */
	submitEinvoice: async (event) => {
		requirePermission(event.locals, 'stock.post');
		const r = await submitEinvoice(orgIdOf(event.locals), Number(event.params.id));
		setFlash(
			r.ok
				? { type: 'success', message: `E-invoice accepted: IRN ${r.irn}` }
				: { type: 'error', message: r.error },
			event.cookies
		);
		return r.ok ? { sent: true } : fail(502, { einvoiceError: r.error });
	},

	/** A draft that will not be posted. Kept, not deleted, so its number range has no mystery gaps. */
	cancel: async (event) => {
		requirePermission(event.locals, 'stock.post');
		const doc = await orgDocument(orgIdOf(event.locals), Number(event.params.id));
		if (doc.status !== 'draft') {
			setFlash({ type: 'error', message: 'Only a draft can be cancelled.' }, event.cookies);
			return fail(409);
		}
		await db
			.update(stockDocument)
			.set({ status: 'cancelled', updatedBy: event.locals.user?.id })
			.where(eq(stockDocument.id, doc.id));
		setFlash({ type: 'success', message: 'Draft cancelled' }, event.cookies);
		return { cancelled: true };
	}
};
