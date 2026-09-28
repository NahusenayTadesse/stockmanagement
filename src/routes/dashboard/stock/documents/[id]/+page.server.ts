import { error, fail } from '@sveltejs/kit';
import { and, asc, eq } from 'drizzle-orm';
import { alias } from 'drizzle-orm/mysql-core';
import { message, setError, superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { setFlash } from 'sveltekit-flash-message/server';
import { childActions, childCrud, WriteRefused } from '@nahu/admin-kit/server/childCrud';
import { hasPermission, requirePermission } from '@nahu/admin-kit/server/permissions';
import { db } from '$lib/server/db';
import {
	branch,
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
import { headerValues, lineValues, orgDocument } from '$lib/server/stock/documents';
import { postDocument, StockError } from '$lib/server/stock/post';
import { paymentActions, paymentSection } from '$lib/server/stock/payment';
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
		// An edited line keeps the order line it delivers; the form does not carry it.
		const withOrderLine = before?.purchaseOrderLineId
			? { ...values, purchaseOrderLineId: before.purchaseOrderLineId }
			: values;
		return lineValues(withOrderLine, orgId, await orgDocument(orgId, Number(event.params.id)));
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
					purchaseOrder: purchaseOrder.number
				})
				.from(stockDocument)
				.innerJoin(branch, eq(branch.id, stockDocument.branchId))
				.leftJoin(fromLoc, eq(fromLoc.id, stockDocument.fromLocationId))
				.leftJoin(toLoc, eq(toLoc.id, stockDocument.toLocationId))
				.leftJoin(user, eq(user.id, stockDocument.createdBy))
				.leftJoin(poster, eq(poster.id, stockDocument.postedBy))
				.leftJoin(supplier, eq(supplier.id, stockDocument.supplierId))
				.leftJoin(purchaseOrder, eq(purchaseOrder.id, stockDocument.purchaseOrderId))
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
			reference: doc.reference ?? '',
			party: doc.party ?? '',
			reason: doc.reason ?? '',
			note: doc.note ?? ''
		},
		zod4(documentHeader),
		{ errors: false }
	);

	return {
		doc,
		names,
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

		try {
			// The type stays what it was: the lines were entered for it.
			const values = await headerValues(orgId, { ...form.data, type: doc.type });
			await db
				.update(stockDocument)
				.set({ ...values, updatedBy: event.locals.user?.id })
				.where(eq(stockDocument.id, doc.id));
		} catch (err) {
			if (err instanceof WriteRefused) {
				if (err.field) setError(form, err.field as 'toLocationId' | 'supplierId', err.message);
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
				postDocument(tx, { orgId, documentId, userId: event.locals.user?.id })
			);
			setFlash({ type: 'success', message: `Posted as ${number}` }, event.cookies);
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
