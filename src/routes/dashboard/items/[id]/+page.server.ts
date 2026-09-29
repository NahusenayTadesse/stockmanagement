import { m } from '$lib/paraglide/messages.js';
import { eq } from 'drizzle-orm';
import { childActions, childCrud } from '@nahu/admin-kit/server/childCrud';
import { hasPermission } from '@nahu/admin-kit/server/permissions';
import { db } from '$lib/server/db';
import { barcode, category, itemUnit, supplier, uom } from '$lib/server/db/schema';
import { orgIdOf } from '$lib/server/tenant';
import { unitOptions } from '$lib/server/options';
import { checkBarcode, checkUnit, requireOrgItem } from '$lib/server/items';
import { productActions, productSection } from './product';
import { planningActions, planningSection } from './planning';
import { binCard, onHandRows } from '$lib/server/stock/queries';
import { barcodeAdd, barcodeEdit, unitAdd, unitEdit } from '$lib/schemas/items';
import type { PageServerLoad, RequestEvent } from './$types';

const units = childCrud({
	table: itemUnit,
	ownerColumn: 'itemId',
	label: () => m.common_rec_unit(),
	addSchema: unitAdd,
	editSchema: unitEdit,
	permission: 'items.manage',
	audit: 'item_unit',
	transform: (values, event, before) =>
		checkUnit(values, orgIdOf(event.locals), Number(event.params.id), before?.id)
});

const barcodes = childCrud({
	table: barcode,
	ownerColumn: 'itemId',
	label: () => m.common_rec_barcode(),
	addSchema: barcodeAdd,
	editSchema: barcodeEdit,
	permission: 'items.manage',
	audit: 'barcode',
	transform: (values, event, before) =>
		checkBarcode(values, orgIdOf(event.locals), Number(event.params.id), before?.id)
});

/** The owner of every child write: the item in the URL, only if it is this business's. */
const owner = async (event: RequestEvent) =>
	(await requireOrgItem(orgIdOf(event.locals), Number(event.params.id))).id;

export const load: PageServerLoad = async ({ params, locals }) => {
	const orgId = orgIdOf(locals);
	const it = await requireOrgItem(orgId, Number(params.id));

	const [unitList, unitSection, barcodeSection, stock, card, [cat], [base]] = await Promise.all([
		unitOptions(orgId),
		units.load(it.id),
		barcodes.load(it.id),
		onHandRows(orgId, { itemId: it.id }),
		binCard(orgId, it.id),
		it.categoryId
			? db.select({ name: category.name }).from(category).where(eq(category.id, it.categoryId))
			: Promise.resolve([undefined]),
		db.select({ name: uom.name, symbol: uom.symbol }).from(uom).where(eq(uom.id, it.baseUomId))
	]);

	const unitName = new Map(unitList.map((u) => [u.value, u.name]));
	const named = <T extends { uomId: number | null }>(rows: T[]) =>
		rows.map((r) => ({
			...r,
			uomId: r.uomId ?? 0,
			unit: r.uomId ? unitName.get(r.uomId) : m.stock_base_unit()
		}));

	return {
		item: it,
		category: cat?.name ?? null,
		supplier: it.supplierId
			? ((
					await db
						.select({ id: supplier.id, name: supplier.name, phone: supplier.phone })
						.from(supplier)
						.where(eq(supplier.id, it.supplierId))
				)[0] ?? null)
			: null,
		base,
		unitList,
		units: {
			...unitSection,
			rows: named(unitSection.rows as (typeof itemUnit.$inferSelect & { id: number })[])
		},
		barcodes: {
			...barcodeSection,
			rows: named(barcodeSection.rows as (typeof barcode.$inferSelect & { id: number })[])
		},
		stock,
		card: card.reverse(), // newest first on screen; the balance column still reads correctly
		// Kit components, variants and the variant's parent.
		...(await productSection(orgId, it, locals)),
		// Minimum and maximum per location, and what is held for proformas and requisitions.
		...(await planningSection(orgId, it, locals)),
		canManage: hasPermission(locals, 'items.manage')
	};
};

export const actions = {
	...childActions({ Unit: units, Barcode: barcodes }, owner),
	...productActions,
	...planningActions
};
