/**
 * Stock document headers and lines: what a draft may contain. Posting is `./post`.
 */
import { error } from '@sveltejs/kit';
import { and, eq, isNull } from 'drizzle-orm';
import { WriteRefused } from '@nahu/admin-kit/server/childCrud';
import { db } from '$lib/server/db';
import {
	item,
	itemUnit,
	location,
	lot,
	purchaseOrderLine,
	stockDocument,
	supplier,
	uom
} from '$lib/server/db/schema';
import { belongsToOrg } from '$lib/server/options';
import type { z } from 'zod/v4';
import type { documentHeader } from '$lib/schemas/stock';

type Header = z.infer<typeof documentHeader>;

export async function orgDocument(orgId: number, id: number) {
	const [doc] = await db
		.select()
		.from(stockDocument)
		.where(and(eq(stockDocument.id, id), eq(stockDocument.orgId, orgId)))
		.limit(1);
	if (!doc) error(404, 'Document not found');
	return doc;
}

/**
 * The header's columns, checked: the locations the type needs are chosen, are this business's,
 * and the branch (whose numbering the document uses) follows from them.
 */
export async function headerValues(orgId: number, h: Header) {
	const needsFrom = h.type !== 'receipt';
	const needsTo = h.type === 'receipt' || h.type === 'transfer';

	const pick = async (id: number, field: 'fromLocationId' | 'toLocationId', needed: boolean) => {
		if (!needed) return null;
		if (!id) {
			throw new WriteRefused(
				field,
				field === 'toLocationId' ? 'Choose where the stock goes.' : 'Choose where the stock is.'
			);
		}
		const [row] = await db
			.select()
			.from(location)
			.where(and(eq(location.id, id), eq(location.orgId, orgId), isNull(location.deletedAt)));
		if (!row) throw new WriteRefused(field, 'Choose a location from the list.');
		return row;
	};

	// No supply without a supplier: a receipt names one, chosen from this business's list.
	let supplierId: number | null = null;
	if (h.type === 'receipt') {
		if (!h.supplierId) {
			throw new WriteRefused('supplierId', 'Choose the supplier, or add a new one.');
		}
		const [found] = await db
			.select({ id: supplier.id })
			.from(supplier)
			.where(
				and(
					eq(supplier.id, h.supplierId),
					eq(supplier.orgId, orgId),
					eq(supplier.isActive, true),
					isNull(supplier.deletedAt)
				)
			);
		if (!found) throw new WriteRefused('supplierId', 'Choose a supplier from the list.');
		supplierId = found.id;
	}

	const from = await pick(h.fromLocationId, 'fromLocationId', needsFrom);
	const to = await pick(h.toLocationId, 'toLocationId', needsTo);
	if (from && to && from.id === to.id) {
		throw new WriteRefused('toLocationId', 'A transfer needs two different locations.');
	}

	return {
		type: h.type,
		docDate: h.docDate,
		fromLocationId: from?.id ?? null,
		toLocationId: to?.id ?? null,
		// Receipts number in the receiving branch; everything else where the stock leaves from.
		branchId: (from ?? to)!.branchId,
		reference: h.reference || null,
		supplierId,
		// A receipt's "who" is its supplier; `party` is for where issued stock went.
		party: h.type === 'receipt' ? null : h.party || null,
		reason: h.type === 'adjustment' && h.reason ? h.reason : null,
		note: h.note || null
	};
}

/**
 * A line, checked against the business and the document it is on. Blank optional fields become
 * nulls; a blank unit becomes the item's base unit.
 */
export async function lineValues(
	values: Record<string, unknown>,
	orgId: number,
	doc: typeof stockDocument.$inferSelect
) {
	const [it] = await db
		.select()
		.from(item)
		.where(and(eq(item.id, Number(values.itemId)), eq(item.orgId, orgId), isNull(item.deletedAt)));
	if (!it) throw new WriteRefused('itemId', 'Choose an item from the list.');
	if (!it.stockTracked) throw new WriteRefused('itemId', `${it.name} is a service, not stock.`);

	// A line delivering an order line keeps that line's item and unit, or "received" stops meaning
	// anything on the order.
	if (values.purchaseOrderLineId) {
		const [ordered] = await db
			.select({ itemId: purchaseOrderLine.itemId, uomId: purchaseOrderLine.uomId })
			.from(purchaseOrderLine)
			.where(
				and(
					eq(purchaseOrderLine.id, Number(values.purchaseOrderLineId)),
					eq(purchaseOrderLine.orgId, orgId),
					eq(purchaseOrderLine.purchaseOrderId, doc.purchaseOrderId ?? -1)
				)
			);
		if (!ordered || ordered.itemId !== it.id) {
			throw new WriteRefused('itemId', 'This line delivers an order line; its item cannot change.');
		}
		values.uomId = ordered.uomId;
	}

	if (Number(values.quantity) < 0 && doc.type !== 'adjustment') {
		throw new WriteRefused('quantity', 'The quantity must be positive.');
	}

	if (!values.uomId) values.uomId = it.baseUomId;
	await belongsToOrg(uom, values.uomId, orgId, 'uomId', 'unit');
	if (Number(values.uomId) !== it.baseUomId) {
		const [conv] = await db
			.select({ id: itemUnit.id })
			.from(itemUnit)
			.where(
				and(
					eq(itemUnit.itemId, it.id),
					eq(itemUnit.uomId, Number(values.uomId)),
					isNull(itemUnit.deletedAt)
				)
			);
		if (!conv) {
			throw new WriteRefused(
				'uomId',
				`${it.name} has no conversion for this unit. Add it on the item's page first.`
			);
		}
	}

	if (values.lotId) {
		const [l] = await db
			.select({ itemId: lot.itemId })
			.from(lot)
			.where(and(eq(lot.id, Number(values.lotId)), eq(lot.orgId, orgId)));
		if (!l || l.itemId !== it.id) throw new WriteRefused('lotId', 'That lot is not of this item.');
	}

	return {
		...values,
		orgId,
		lotId: values.lotId || null,
		lotNumber: values.lotNumber || null,
		expiryDate: values.expiryDate || null,
		serials: values.serials || null
	};
}
