/**
 * Purchase-order line form values. Kept apart from `purchasing.ts`, which the posting service and
 * the seed script import: this one needs the kit's form helpers, which only load under Vite.
 */
import { and, eq, isNull } from 'drizzle-orm';
import { WriteRefused } from '@nahu/admin-kit/server/childCrud';
import { db } from '$lib/server/db';
import { item } from '$lib/server/db/schema';
import { m } from '$lib/paraglide/messages.js';
import { unitFactor } from '$lib/server/units';

/** An order line, checked: this business's stock item, in a unit it has a conversion for. */
export async function orderLineValues(values: Record<string, unknown>, orgId: number) {
	const [it] = await db
		.select()
		.from(item)
		.where(and(eq(item.id, Number(values.itemId)), eq(item.orgId, orgId), isNull(item.deletedAt)));
	if (!it) throw new WriteRefused('itemId', m.purchasing_v_item_from_list());
	if (!it.stockTracked)
		throw new WriteRefused('itemId', m.purchasing_v_item_is_service({ item: it.name }));

	if (!values.uomId) values.uomId = it.baseUomId;
	if ((await unitFactor(db, it, Number(values.uomId))) === null) {
		throw new WriteRefused('uomId', m.purchasing_v_no_unit_conversion({ item: it.name }));
	}
	return { ...values, orgId, note: values.note || null };
}
