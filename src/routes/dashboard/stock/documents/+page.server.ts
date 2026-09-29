import { alias } from 'drizzle-orm/mysql-core';
import { desc, eq, sql, and, isNull } from 'drizzle-orm';
import { message, setError, superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { redirect } from 'sveltekit-flash-message/server';
import { WriteRefused } from '@nahu/admin-kit/server/childCrud';
import { hasPermission, requirePermission } from '@nahu/admin-kit/server/permissions';
import { localToday } from '@nahu/admin-kit/time';
import { db } from '$lib/server/db';
import { qualified } from '$lib/server/db/sql';
import {
	customer,
	location,
	stockDocument,
	stockDocumentLine,
	supplier,
	transactions,
	user
} from '$lib/server/db/schema';
import { orgIdOf } from '$lib/server/tenant';
import { branchScope, scopeWhere } from '$lib/server/scope';
import { locationOptions, supplierOptions } from '$lib/server/options';
import { supplierSchema } from '$lib/schemas/suppliers';
import { customerPicker, headerValues } from '$lib/server/stock/documents';
import { documentHeader } from '$lib/schemas/stock';
import type { Actions, PageServerLoad } from './$types';

const fromLoc = alias(location, 'from_loc');
const toLoc = alias(location, 'to_loc');

export const load: PageServerLoad = async ({ locals }) => {
	const orgId = orgIdOf(locals);
	const scope = await branchScope(locals);
	const [documents, locations, destinations, form] = await Promise.all([
		db
			.select({
				id: stockDocument.id,
				number: stockDocument.number,
				type: stockDocument.type,
				status: stockDocument.status,
				docDate: stockDocument.docDate,
				from: fromLoc.name,
				to: toLoc.name,
				// Receipts show their supplier; issues the customer, or who the stock went to.
				party: sql<
					string | null
				>`COALESCE(${supplier.name}, ${customer.name}, ${stockDocument.party})`,
				supplierId: stockDocument.supplierId,
				reference: stockDocument.reference,
				createdBy: user.name,
				paymentId: transactions.id,
				paymentAmount: transactions.amount,
				paymentDirection: transactions.direction,
				paymentStatus: transactions.status,
				lines: sql<number>`(
					SELECT COUNT(*) FROM ${stockDocumentLine}
					WHERE ${stockDocumentLine.documentId} = ${qualified(stockDocument, stockDocument.id)}
						AND ${stockDocumentLine.deletedAt} IS NULL
				)`
			})
			.from(stockDocument)
			.leftJoin(fromLoc, eq(fromLoc.id, stockDocument.fromLocationId))
			.leftJoin(toLoc, eq(toLoc.id, stockDocument.toLocationId))
			.leftJoin(user, eq(user.id, stockDocument.createdBy))
			.leftJoin(transactions, eq(transactions.id, stockDocument.transactionId))
			.leftJoin(supplier, eq(supplier.id, stockDocument.supplierId))
			.leftJoin(customer, eq(customer.id, stockDocument.customerId))
			.where(
				and(
					eq(stockDocument.orgId, orgId),
					isNull(stockDocument.deletedAt),
					// The viewer's branches: documents numbered there, or moving stock in or out of them.
					scopeWhere(scope, stockDocument.branchId, fromLoc.branchId, toLoc.branchId)
				)
			)
			.orderBy(desc(stockDocument.id))
			.limit(1000),
		locationOptions(orgId, scope),
		// A transfer may go to any branch's location, not only the viewer's.
		scope ? locationOptions(orgId) : Promise.resolve(null),
		superValidate({ docDate: localToday() }, zod4(documentHeader), { errors: false })
	]);

	return {
		documents,
		locations,
		destinations: destinations ?? locations,
		form,
		suppliers: await supplierOptions(orgId),
		supplierForm: hasPermission(locals, 'suppliers.manage')
			? await superValidate(zod4(supplierSchema))
			: undefined,
		...(await customerPicker(orgId, locals)),
		canDraft: hasPermission(locals, 'stock.draft')
	};
};

export const actions: Actions = {
	/** A new draft. Lines are added on its own page. */
	create: async (event) => {
		requirePermission(event.locals, 'stock.draft');
		const orgId = orgIdOf(event.locals);
		const form = await superValidate(event.request, zod4(documentHeader));
		if (!form.valid) {
			return message(form, { type: 'error', text: 'Please check the form' }, { status: 400 });
		}

		let id: number;
		try {
			const values = await headerValues(orgId, form.data, {
				scope: await branchScope(event.locals)
			});
			const [created] = await db
				.insert(stockDocument)
				.values({ ...values, orgId, createdBy: event.locals.user?.id })
				.$returningId();
			id = created.id;
		} catch (err) {
			if (err instanceof WriteRefused) {
				if (err.field)
					setError(form, err.field as 'toLocationId' | 'supplierId' | 'customerId', err.message);
				return message(form, { type: 'error', text: err.message }, { status: 400 });
			}
			throw err;
		}

		redirect(
			`/dashboard/stock/documents/${id}`,
			{ type: 'success', message: 'Draft created — add the lines' },
			event.cookies
		);
	}
};
