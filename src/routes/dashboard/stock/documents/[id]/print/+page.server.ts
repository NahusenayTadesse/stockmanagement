import { error } from '@sveltejs/kit';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { alias } from 'drizzle-orm/mysql-core';
import { db } from '$lib/server/db';
import {
	branch,
	customer,
	item,
	location,
	lot,
	organization,
	paymentMethod,
	stockDocument,
	supplier,
	transactions,
	stockDocumentLine,
	uom,
	user
} from '$lib/server/db/schema';
import { orgIdOf } from '$lib/server/tenant';
import { documentTotals } from '$lib/server/tax';
import QRCode from 'qrcode';
import type { PageServerLoad } from './$types';

const fromLoc = alias(location, 'from_loc');
const toLoc = alias(location, 'to_loc');
const poster = alias(user, 'poster');

/** The paper copy: a goods received note, store issue voucher, transfer or adjustment slip. */
export const load: PageServerLoad = async ({ params, locals }) => {
	const orgId = orgIdOf(locals);

	const [doc] = await db
		.select({
			id: stockDocument.id,
			type: stockDocument.type,
			status: stockDocument.status,
			number: stockDocument.number,
			docDate: stockDocument.docDate,
			reference: stockDocument.reference,
			party: stockDocument.party,
			reason: stockDocument.reason,
			note: stockDocument.note,
			driverName: stockDocument.driverName,
			vehiclePlate: stockDocument.vehiclePlate,
			currency: stockDocument.currency,
			exchangeRate: stockDocument.exchangeRate,
			from: fromLoc.name,
			to: toLoc.name,
			branch: branch.name,
			branchAddress: branch.address,
			branchPhone: branch.phone,
			createdBy: user.name,
			postedBy: poster.name,
			org: organization.name,
			logo: organization.logo,
			supplier: supplier.name,
			supplierPhone: supplier.phone,
			supplierTin: supplier.tin,
			customer: customer.name,
			customerPhone: customer.phone,
			customerTin: customer.tin,
			tin: organization.tin,
			paidAmount: transactions.amount,
			paidStatus: transactions.status,
			paidOn: transactions.occurredOn,
			paidBy: paymentMethod.name,
			paidReference: transactions.reference,
			paidReceipt: transactions.receiptNumber
		})
		.from(stockDocument)
		.innerJoin(branch, eq(branch.id, stockDocument.branchId))
		.innerJoin(organization, eq(organization.id, stockDocument.orgId))
		.leftJoin(fromLoc, eq(fromLoc.id, stockDocument.fromLocationId))
		.leftJoin(toLoc, eq(toLoc.id, stockDocument.toLocationId))
		.leftJoin(user, eq(user.id, stockDocument.createdBy))
		.leftJoin(poster, eq(poster.id, stockDocument.postedBy))
		.leftJoin(supplier, eq(supplier.id, stockDocument.supplierId))
		.leftJoin(customer, eq(customer.id, stockDocument.customerId))
		.leftJoin(transactions, eq(transactions.id, stockDocument.transactionId))
		.leftJoin(paymentMethod, eq(paymentMethod.id, transactions.paymentMethodId))
		.where(and(eq(stockDocument.id, Number(params.id)), eq(stockDocument.orgId, orgId)));

	if (!doc) error(404, 'Document not found');

	const lines = await db
		.select({
			id: stockDocumentLine.id,
			item: item.name,
			sku: item.sku,
			quantity: stockDocumentLine.quantity,
			unit: uom.symbol,
			unitCost: stockDocumentLine.unitCost,
			unitPrice: stockDocumentLine.unitPrice,
			lotNumber: stockDocumentLine.lotNumber,
			pickedLot: lot.lotNumber,
			expiryDate: stockDocumentLine.expiryDate,
			serials: stockDocumentLine.serials
		})
		.from(stockDocumentLine)
		.innerJoin(item, eq(item.id, stockDocumentLine.itemId))
		.innerJoin(uom, eq(uom.id, stockDocumentLine.uomId))
		.leftJoin(lot, eq(lot.id, stockDocumentLine.lotId))
		.where(and(eq(stockDocumentLine.documentId, doc.id), isNull(stockDocumentLine.deletedAt)))
		.orderBy(asc(stockDocumentLine.id));

	const [fiscal] = await db
		.select({
			fsNumber: stockDocument.fiscalReceiptNumber,
			machineCode: stockDocument.fiscalMachineCode,
			irn: stockDocument.einvoiceIrn,
			qr: stockDocument.einvoiceQr
		})
		.from(stockDocument)
		.where(eq(stockDocument.id, doc.id));
	return {
		doc,
		lines,
		totals: await documentTotals(orgId, doc.id),
		fiscal: {
			...fiscal,
			qrImage: fiscal.qr ? await QRCode.toDataURL(fiscal.qr, { margin: 1, width: 140 }) : null
		}
	};
};
