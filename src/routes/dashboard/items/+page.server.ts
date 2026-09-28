import { hasPermission } from '@nahu/admin-kit/server/permissions';
import { item } from '$lib/server/db/schema';
import { orgCrud, orgIdOf } from '$lib/server/tenant';
import { categoryOptions, supplierOptions, unitOptions } from '$lib/server/options';
import { superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { supplierSchema } from '$lib/schemas/suppliers';
import { checkItem } from '$lib/server/items';
import { db } from '$lib/server/db';
import { stockBalance, uom } from '$lib/server/db/schema';
import { eq, sql } from 'drizzle-orm';
import { itemAdd, itemEdit } from '$lib/schemas/items';
import type { PageServerLoad } from './$types';

const crud = orgCrud({
	table: item,
	label: 'Item',
	addSchema: itemAdd,
	editSchema: itemEdit,
	permission: 'items.manage',
	audit: 'item',
	transform: (values, event, before) => checkItem(values, orgIdOf(event.locals), before)
});

export const load: PageServerLoad = async (event) => {
	const orgId = orgIdOf(event.locals);
	const [page, categoryList, unitList, totals, symbols, supplierList] = await Promise.all([
		crud.load(event),
		categoryOptions(orgId),
		unitOptions(orgId),
		db
			.select({ itemId: stockBalance.itemId, onHand: sql<number>`SUM(${stockBalance.quantity})` })
			.from(stockBalance)
			.where(eq(stockBalance.orgId, orgId))
			.groupBy(stockBalance.itemId),
		db.select({ id: uom.id, symbol: uom.symbol }).from(uom).where(eq(uom.orgId, orgId)),
		supplierOptions(orgId)
	]);
	const suppliers = new Map(supplierList.map((s) => [s.value, s.name]));

	const categories = new Map(categoryList.map((c) => [c.value, c.name]));
	const units = new Map(unitList.map((u) => [u.value, u.name]));
	const onHand = new Map(totals.map((t) => [t.itemId, Number(t.onHand)]));
	const symbol = new Map(symbols.map((u) => [u.id, u.symbol]));

	return {
		...page,
		rows: (page.rows as (typeof item.$inferSelect)[]).map((row) => ({
			...row,
			status: row.isActive,
			categoryId: row.categoryId ?? 0,
			supplierId: row.supplierId ?? 0,
			supplier: row.supplierId ? (suppliers.get(row.supplierId) ?? '—') : '—',
			category: row.categoryId ? (categories.get(row.categoryId) ?? '—') : '—',
			unit: units.get(row.baseUomId) ?? '—',
			unitSymbol: symbol.get(row.baseUomId) ?? '',
			onHand: onHand.get(row.id) ?? 0
		})),
		categoryList: [{ value: 0, name: '— None —' }, ...categoryList],
		unitList,
		supplierList: [{ value: 0, name: '— None (services only) —' }, ...supplierList],
		supplierForm: hasPermission(event.locals, 'suppliers.manage')
			? await superValidate(zod4(supplierSchema))
			: undefined,
		canManage: hasPermission(event.locals, 'items.manage')
	};
};

export const actions = crud.actions;
