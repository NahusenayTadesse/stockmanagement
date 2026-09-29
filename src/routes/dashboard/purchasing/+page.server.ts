import { message, setError, superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { redirect } from 'sveltekit-flash-message/server';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { hasPermission, requirePermission } from '@nahu/admin-kit/server/permissions';
import { localToday } from '@nahu/admin-kit/time';
import { db } from '$lib/server/db';
import { location, purchaseOrder, supplier } from '$lib/server/db/schema';
import { orgIdOf } from '$lib/server/tenant';
import { branchScope, inScope } from '$lib/server/scope';
import { locationOptions, supplierOptions } from '$lib/server/options';
import { orderList } from '$lib/server/purchasing';
import { orderHeader } from '$lib/schemas/purchasing';
import { m } from '$lib/paraglide/messages.js';
import { supplierSchema } from '$lib/schemas/suppliers';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const orgId = orgIdOf(locals);
	const canManage = hasPermission(locals, 'purchasing.manage');
	const scope = await branchScope(locals);
	const [orders, suppliers, locations, form] = await Promise.all([
		// The viewer's branches only (`orderList` covers every branch).
		Promise.all([
			orderList(orgId),
			scope
				? db
						.select({ id: purchaseOrder.id })
						.from(purchaseOrder)
						.where(
							and(eq(purchaseOrder.orgId, orgId), inArray(purchaseOrder.branchId, [-1, ...scope]))
						)
				: null
		]).then(([rows, mine]) => {
			if (!mine) return rows;
			const ids = new Set(mine.map((m) => m.id));
			return rows.filter((o) => ids.has(o.id));
		}),
		supplierOptions(orgId),
		locationOptions(orgId, scope),
		superValidate({ orderDate: localToday() }, zod4(orderHeader), { errors: false })
	]);
	return {
		orders,
		suppliers,
		locations,
		form,
		supplierForm:
			canManage && hasPermission(locals, 'suppliers.manage')
				? await superValidate(zod4(supplierSchema))
				: undefined,
		canManage
	};
};

export const actions: Actions = {
	create: async (event) => {
		requirePermission(event.locals, 'purchasing.manage');
		const orgId = orgIdOf(event.locals);
		const form = await superValidate(event.request, zod4(orderHeader));
		if (!form.valid)
			return message(form, { type: 'error', text: m.common_check_form() }, { status: 400 });

		const [[sup], [loc]] = await Promise.all([
			db
				.select({ id: supplier.id })
				.from(supplier)
				.where(
					and(
						eq(supplier.id, form.data.supplierId),
						eq(supplier.orgId, orgId),
						eq(supplier.isActive, true),
						isNull(supplier.deletedAt)
					)
				),
			db
				.select({ id: location.id, branchId: location.branchId, kind: location.kind })
				.from(location)
				.where(
					and(
						eq(location.id, form.data.locationId),
						eq(location.orgId, orgId),
						isNull(location.deletedAt)
					)
				)
		]);
		const scope = await branchScope(event.locals);
		if (!sup) {
			setError(form, 'supplierId', m.purchasing_v_supplier_from_list());
			return message(
				form,
				{ type: 'error', text: m.purchasing_v_supplier_from_list() },
				{ status: 400 }
			);
		}
		if (!loc || loc.kind === 'transit' || !inScope(scope, loc.branchId)) {
			setError(form, 'locationId', m.purchasing_v_location_from_list());
			return message(
				form,
				{ type: 'error', text: m.purchasing_v_location_from_list() },
				{ status: 400 }
			);
		}

		const [row] = await db
			.insert(purchaseOrder)
			.values({
				orgId,
				branchId: loc.branchId,
				supplierId: sup.id,
				locationId: loc.id,
				orderDate: form.data.orderDate,
				expectedDate: form.data.expectedDate || null,
				reference: form.data.reference || null,
				note: form.data.note || null,
				createdBy: event.locals.user?.id
			})
			.$returningId();

		redirect(
			`/dashboard/purchasing/${row.id}`,
			{ type: 'success', message: m.purchasing_po_created() },
			event.cookies
		);
	}
};
