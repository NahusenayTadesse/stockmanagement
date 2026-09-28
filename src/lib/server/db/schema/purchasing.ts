import {
	date,
	datetime,
	decimal,
	index,
	int,
	mysqlEnum,
	mysqlTable,
	text,
	uniqueIndex,
	varchar
} from 'drizzle-orm/mysql-core';
import { user } from './auth';
import { item, uom } from './catalog';
import { branch, location } from './locations';
import { supplier } from './suppliers';
import { deletionFields, orgRef, secureFields } from './fields';
import { PO_STATUSES } from '../../../constants';

/**
 * An order to a supplier. Drafted, then marked ordered (which gives it its number and is what the
 * supplier is sent). Goods arrive as ordinary goods receipts that point back at it — the ledger
 * never learns about orders — and its status follows what those receipts delivered.
 */
export const purchaseOrder = mysqlTable(
	'purchase_order',
	{
		id: int('id').autoincrement().primaryKey(),
		orgId: orgRef(),
		branchId: int('branch_id')
			.notNull()
			.references(() => branch.id, { onDelete: 'restrict' }),
		supplierId: int('supplier_id')
			.notNull()
			.references(() => supplier.id, { onDelete: 'restrict' }),
		/** Assigned when ordered, e.g. `BOL-PO-2019-00003`. */
		number: varchar('number', { length: 40 }),
		status: mysqlEnum('status', PO_STATUSES).notNull().default('draft'),
		orderDate: date('order_date', { mode: 'string' }).notNull(),
		expectedDate: date('expected_date', { mode: 'string' }),
		/** Where the goods should be delivered. */
		locationId: int('location_id')
			.notNull()
			.references(() => location.id, { onDelete: 'restrict' }),
		reference: varchar('reference', { length: 80 }),
		note: text('note'),
		orderedAt: datetime('ordered_at'),
		orderedBy: varchar('ordered_by', { length: 255 }).references(() => user.id, {
			onDelete: 'set null'
		}),
		...secureFields
	},
	(table) => [
		uniqueIndex('purchase_order_number_idx').on(table.orgId, table.number),
		index('purchase_order_org_status_idx').on(table.orgId, table.status),
		index('purchase_order_supplier_idx').on(table.supplierId)
	]
);

export const purchaseOrderLine = mysqlTable(
	'purchase_order_line',
	{
		id: int('id').autoincrement().primaryKey(),
		orgId: orgRef(),
		purchaseOrderId: int('purchase_order_id')
			.notNull()
			.references(() => purchaseOrder.id, { onDelete: 'cascade' }),
		itemId: int('item_id')
			.notNull()
			.references(() => item.id, { onDelete: 'restrict' }),
		/** The unit ordered in; receipts against this line use the same unit. */
		uomId: int('uom_id')
			.notNull()
			.references(() => uom.id, { onDelete: 'restrict' }),
		quantity: decimal('quantity', { precision: 18, scale: 4, mode: 'number' }).notNull(),
		/** Agreed price per `uomId`, copied onto the receipt as its cost. */
		unitPrice: decimal('unit_price', { precision: 18, scale: 4, mode: 'number' }),
		note: varchar('note', { length: 255 }),
		...deletionFields
	},
	(table) => [index('purchase_order_line_po_idx').on(table.purchaseOrderId)]
);
