import { and, asc, desc, eq, isNull, sql } from 'drizzle-orm';
import { hasPermission } from '@nahu/admin-kit/server/permissions';
import { db } from '$lib/server/db';
import { barcode, item, stockDocument, supplier } from '$lib/server/db/schema';
import { orgIdOf } from '$lib/server/tenant';
import type { PageServerLoad } from './$types';

/** Choosing what to print labels for: items and copies, or everything a delivery brought in. */
export const load: PageServerLoad = async ({ locals }) => {
	const orgId = orgIdOf(locals);
	const hasCode = sql<number>`EXISTS (SELECT 1 FROM ${barcode}
		WHERE ${barcode.itemId} = ${item.id} AND ${barcode.deletedAt} IS NULL)`;
	const [items, receipts] = await Promise.all([
		db
			.select({
				id: item.id,
				sku: item.sku,
				name: item.name,
				variantLabel: item.variantLabel,
				salePrice: item.salePrice,
				hasBarcode: hasCode
			})
			.from(item)
			.where(and(eq(item.orgId, orgId), isNull(item.deletedAt), eq(item.isActive, true)))
			.orderBy(asc(item.name)),
		db
			.select({
				id: stockDocument.id,
				number: stockDocument.number,
				docDate: stockDocument.docDate,
				supplier: supplier.name
			})
			.from(stockDocument)
			.leftJoin(supplier, eq(supplier.id, stockDocument.supplierId))
			.where(
				and(
					eq(stockDocument.orgId, orgId),
					eq(stockDocument.type, 'receipt'),
					eq(stockDocument.status, 'posted')
				)
			)
			.orderBy(desc(stockDocument.id))
			.limit(30)
	]);
	return {
		items: items.map((i) => ({ ...i, hasBarcode: Boolean(Number(i.hasBarcode)) })),
		receipts,
		canManage: hasPermission(locals, 'items.manage')
	};
};
