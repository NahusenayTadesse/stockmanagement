/**
 * The item page's product structure: a kit's or recipe's components, an item's variants, and the
 * item a variant belongs to. Kept apart from the page's own load so the sections stay separable.
 */
import type { RequestEvent } from '@sveltejs/kit';
import { and, asc, eq, isNull, ne, sql } from 'drizzle-orm';
import { message, setError, superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { childActions, childCrud, WriteRefused } from '@nahu/admin-kit/server/childCrud';
import { hasPermission, requirePermission } from '@nahu/admin-kit/server/permissions';
import { db } from '$lib/server/db';
import { item, kitComponent } from '$lib/server/db/schema';
import { orgIdOf } from '$lib/server/tenant';
import {
	checkComponent,
	createVariant,
	kitComponents,
	requireOrgItem,
	variantsOf
} from '$lib/server/items';
import { componentAdd, componentEdit, variantAdd } from '$lib/schemas/items';

const components = childCrud({
	table: kitComponent,
	ownerColumn: 'kitItemId',
	label: 'Component',
	addSchema: componentAdd,
	editSchema: componentEdit,
	permission: 'items.manage',
	audit: 'kit_component',
	transform: (values, event, before) =>
		checkComponent(values, orgIdOf(event.locals), Number(event.params.id), before?.id)
});

const owner = async (event: RequestEvent) =>
	(await requireOrgItem(orgIdOf(event.locals), Number(event.params.id))).id;

type Item = typeof item.$inferSelect;

export async function productSection(orgId: number, it: Item, locals: App.Locals) {
	const [kit, variants, parent, variantForm] = await Promise.all([
		it.isKit ? kitSection(orgId, it) : Promise.resolve(null),
		it.parentItemId ? Promise.resolve([]) : variantsOf(orgId, it.id),
		it.parentItemId
			? db
					.select({ id: item.id, name: item.name, sku: item.sku })
					.from(item)
					.where(and(eq(item.id, it.parentItemId), eq(item.orgId, orgId)))
					.then((r) => r[0] ?? null)
			: Promise.resolve(null),
		hasPermission(locals, 'items.manage') && !it.parentItemId
			? superValidate(zod4(variantAdd))
			: Promise.resolve(undefined)
	]);
	return { kit, variants, parent, variantForm };
}

async function kitSection(orgId: number, it: Item) {
	const [section, detail, choices] = await Promise.all([
		components.load(it.id),
		kitComponents(orgId, it.id),
		// What can go into a kit: stocked or service items, never a kit or a serial-tracked item.
		db
			.select({ value: item.id, name: sql<string>`CONCAT(${item.name}, ' — ', ${item.sku})` })
			.from(item)
			.where(
				and(
					eq(item.orgId, orgId),
					eq(item.isActive, true),
					eq(item.isKit, false),
					eq(item.trackSerials, false),
					ne(item.id, it.id),
					isNull(item.deletedAt)
				)
			)
			.orderBy(asc(item.name))
	]);
	const byId = new Map(detail.map((d) => [d.id, d]));
	const rows = (section.rows as { id: number }[]).map((r) => {
		const d = byId.get(r.id);
		return {
			...r,
			component: d ? `${d.item} — ${d.sku}` : '—',
			unit: d?.unit ?? '—',
			cost: d?.cost ?? 0,
			onHand: d?.onHand ?? 0,
			makes: d?.makes ?? null
		};
	});
	const cost = Math.round(detail.reduce((s, d) => s + d.cost, 0) * 100) / 100;
	const limits = detail.map((d) => d.makes).filter((m): m is number => m !== null);
	return {
		...section,
		rows,
		componentList: choices,
		cost,
		margin: it.salePrice != null ? Math.round((it.salePrice - cost) * 100) / 100 : null,
		/** How many kits the stock on hand could make, everywhere. Null: nothing limits it. */
		makes: detail.length ? (limits.length ? Math.min(...limits) : null) : 0
	};
}

export const productActions = {
	...childActions({ Component: components }, owner),

	/** A copy of this item under its own code and label. */
	addVariant: async (event: RequestEvent) => {
		requirePermission(event.locals, 'items.manage');
		const form = await superValidate(event.request, zod4(variantAdd));
		if (!form.valid) {
			return message(form, { type: 'error', text: 'Please check the form' }, { status: 400 });
		}
		try {
			await createVariant(
				orgIdOf(event.locals),
				Number(event.params.id),
				form.data,
				event.locals.user?.id
			);
		} catch (err) {
			if (err instanceof WriteRefused) {
				// A clash of the barcode is reported against the barcode field.
				const field = err.field === 'code' ? 'barcode' : err.field;
				if (field) setError(form, field as 'sku', err.message);
				return message(form, { type: 'error', text: err.message }, { status: 400 });
			}
			throw err;
		}
		return message(form, { type: 'success', text: `Variant ${form.data.variantLabel} added` });
	}
};
