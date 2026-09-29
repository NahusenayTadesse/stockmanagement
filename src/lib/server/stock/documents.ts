/**
 * Stock document headers and lines: what a draft may contain. Posting is `./post`.
 */
import { m } from '$lib/paraglide/messages.js';

import { and, eq, isNull } from 'drizzle-orm';
import { WriteRefused } from '@nahu/admin-kit/server/childCrud';
import { db } from '$lib/server/db';
import {
	item,
	location,
	lot,
	purchaseOrderLine,
	stockDocument,
	stockDocumentLine,
	supplier,
	uom
} from '$lib/server/db/schema';
import { superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { hasPermission } from '@nahu/admin-kit/server/permissions';
import { belongsToOrg, customerOptions } from '$lib/server/options';
import { checkCustomer, sellsToCustomers } from '$lib/server/customers';
import { customerSchema } from '$lib/schemas/customers';
import type { z } from 'zod/v4';
import type { documentHeader } from '$lib/schemas/stock';
import { cents, round4 } from '$lib/money';
import { unitFactor } from '$lib/server/units';
import { orgRowOr404 } from '$lib/server/org';

type Header = z.infer<typeof documentHeader>;

export async function orgDocument(orgId: number, id: number) {
	return orgRowOr404(stockDocument, orgId, id, m.stock_doc_not_found);
}

/**
 * The issue form's customer picker and "+ New customer" form — or nothing, for a business that
 * does not sell (an internal store issues to departments, written in "Issued to").
 */
export async function customerPicker(orgId: number, locals: App.Locals) {
	if (!(await sellsToCustomers(orgId))) {
		return { customers: null, customerForm: undefined };
	}
	return {
		customers: await customerOptions(orgId),
		customerForm: hasPermission(locals, 'customers.manage')
			? await superValidate(zod4(customerSchema))
			: undefined
	};
}

/**
 * The header's columns, checked: the locations the type needs are chosen, are this business's,
 * and the branch (whose numbering the document uses) follows from them.
 */
export async function headerValues(
	orgId: number,
	h: Header,
	options: {
		allowReturn?: boolean;
		/**
		 * The viewer's branches (`$lib/server/scope`); null for all. Stock may only leave from —
		 * or, for receipts and returns, arrive at — a location in them. A transfer may go anywhere.
		 */
		scope?: number[] | null;
	} = {}
) {
	// Returns are started from the sale or receipt they return, never from the blank form.
	if ((h.type === 'sales_return' || h.type === 'purchase_return') && !options.allowReturn) {
		throw new WriteRefused('type', m.stock_err_start_return());
	}
	const needsFrom = h.type !== 'receipt' && h.type !== 'sales_return';
	const needsTo = h.type === 'receipt' || h.type === 'transfer' || h.type === 'sales_return';

	const pick = async (id: number, field: 'fromLocationId' | 'toLocationId', needed: boolean) => {
		if (!needed) return null;
		if (!id) {
			throw new WriteRefused(
				field,
				field === 'toLocationId' ? m.stock_err_choose_to() : m.stock_err_choose_from()
			);
		}
		const [row] = await db
			.select()
			.from(location)
			.where(and(eq(location.id, id), eq(location.orgId, orgId), isNull(location.deletedAt)));
		if (!row) throw new WriteRefused(field, m.stock_err_location_list());
		return row;
	};

	// No supply without a supplier: a receipt names one, chosen from this business's list.
	let supplierId: number | null = null;
	if (h.type === 'receipt') {
		if (!h.supplierId) {
			throw new WriteRefused('supplierId', m.stock_err_supplier_or_new());
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
		if (!found) throw new WriteRefused('supplierId', m.stock_err_supplier_list());
		supplierId = found.id;
	}

	// Issues may name a customer; nothing needs one.
	let customerId: number | null = null;
	if (h.type === 'issue' && h.customerId) {
		const found = await checkCustomer(orgId, h.customerId);
		if (!found) throw new WriteRefused('customerId', m.stock_err_customer_list());
		customerId = found.id;
	}

	const from = await pick(h.fromLocationId, 'fromLocationId', needsFrom);
	const to = await pick(h.toLocationId, 'toLocationId', needsTo);
	if (from && to && from.id === to.id) {
		throw new WriteRefused('toLocationId', m.stock_err_two_locations());
	}
	if (from?.kind === 'transit' || to?.kind === 'transit') {
		throw new WriteRefused(
			from?.kind === 'transit' ? 'fromLocationId' : 'toLocationId',
			m.stock_err_transit_only()
		);
	}
	const scope = options.scope ?? null;
	const own = from ?? to;
	if (scope && own && !scope.includes(own.branchId)) {
		throw new WriteRefused(from ? 'fromLocationId' : 'toLocationId', m.stock_err_your_branch());
	}

	// Another currency: only on receipts, and then with the rate it was bought at.
	const currency = h.type === 'receipt' && h.currency && h.currency !== 'ETB' ? h.currency : null;
	if (currency && !h.exchangeRate) {
		throw new WriteRefused('exchangeRate', m.stock_err_rate({ currency }));
	}
	const crossBranch = h.type === 'transfer' && from && to && from.branchId !== to.branchId;

	return {
		type: h.type,
		docDate: h.docDate,
		fromLocationId: from?.id ?? null,
		toLocationId: to?.id ?? null,
		// Receipts number in the receiving branch; everything else where the stock leaves from.
		branchId: (from ?? to)!.branchId,
		reference: h.reference || null,
		supplierId,
		customerId,
		// A receipt's "who" is its supplier; `party` is for where issued stock went.
		party: h.type === 'receipt' ? null : h.party || null,
		reason: h.type === 'adjustment' && h.reason ? h.reason : null,
		note: h.note || null,
		driverName: crossBranch ? h.driverName || null : null,
		vehiclePlate: crossBranch ? h.vehiclePlate.toUpperCase() || null : null,
		currency,
		exchangeRate: currency ? h.exchangeRate : null
	};
}

/**
 * A receipt's rate changed: every line priced in its currency is costed again in birr, so the
 * lines never disagree with the header.
 */
export async function recostForeignLines(documentId: number, exchangeRate: number | null) {
	const lines = await db
		.select({ id: stockDocumentLine.id, foreign: stockDocumentLine.foreignUnitCost })
		.from(stockDocumentLine)
		.where(and(eq(stockDocumentLine.documentId, documentId), isNull(stockDocumentLine.deletedAt)));
	for (const l of lines) {
		if (l.foreign === null) continue;
		await db
			.update(stockDocumentLine)
			.set(
				exchangeRate ? { unitCost: round4(l.foreign * exchangeRate) } : { foreignUnitCost: null }
			)
			.where(eq(stockDocumentLine.id, l.id));
	}
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
	if (!it) throw new WriteRefused('itemId', m.stock_err_item_list());
	// Services and kits have no stock: they can be sold (a kit's components leave the shelf), and
	// nothing else.
	if (!it.stockTracked && doc.type !== 'issue') {
		throw new WriteRefused(
			'itemId',
			doc.type === 'receipt'
				? m.stock_err_not_stocked_receive({ item: it.name })
				: m.stock_err_not_stocked_move({ item: it.name })
		);
	}
	if (!it.stockTracked && !it.sellable) {
		throw new WriteRefused('itemId', m.stock_err_not_for_sale({ item: it.name }));
	}

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
			throw new WriteRefused('itemId', m.stock_err_order_line_item());
		}
		values.uomId = ordered.uomId;
	}

	if (Number(values.quantity) < 0 && doc.type !== 'adjustment') {
		throw new WriteRefused('quantity', m.stock_err_positive());
	}

	if (!values.uomId) values.uomId = it.baseUomId;
	await belongsToOrg(uom, values.uomId, orgId, 'uomId', 'unit');
	const factor = await unitFactor(db, it, Number(values.uomId));
	if (factor === null) {
		throw new WriteRefused('uomId', m.stock_err_no_conversion_unit({ item: it.name }));
	}

	// A sale price belongs on issues only; left empty, it is the item's list price for this unit.
	let unitPrice: number | null = null;
	if (doc.type === 'issue') {
		unitPrice =
			values.unitPrice != null && values.unitPrice !== ''
				? Number(values.unitPrice)
				: it.salePrice != null
					? cents(it.salePrice * factor)
					: null;
	}

	if (values.lotId) {
		const [l] = await db
			.select({ itemId: lot.itemId })
			.from(lot)
			.where(and(eq(lot.id, Number(values.lotId)), eq(lot.orgId, orgId)));
		if (!l || l.itemId !== it.id) throw new WriteRefused('lotId', m.stock_err_lot_not_item());
	}

	// Bought in another currency: the price as invoiced, and its cost in birr at the receipt's rate.
	let unitCost = values.unitCost ?? null;
	let foreignUnitCost: number | null = null;
	if (doc.type === 'receipt' && doc.currency && doc.exchangeRate) {
		if (values.foreignUnitCost != null && values.foreignUnitCost !== '') {
			foreignUnitCost = Number(values.foreignUnitCost);
			unitCost = round4(foreignUnitCost * doc.exchangeRate);
		}
	}

	return {
		...values,
		orgId,
		lotId: it.stockTracked ? values.lotId || null : null,
		lotNumber: it.stockTracked ? values.lotNumber || null : null,
		expiryDate: it.stockTracked ? values.expiryDate || null : null,
		serials: it.stockTracked ? values.serials || null : null,
		unitCost,
		foreignUnitCost,
		unitPrice
	};
}
