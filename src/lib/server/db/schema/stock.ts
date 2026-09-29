import {
	date,
	datetime,
	decimal,
	foreignKey,
	index,
	int,
	mysqlEnum,
	mysqlTable,
	text,
	timestamp,
	uniqueIndex,
	varchar,
	type AnyMySqlColumn
} from 'drizzle-orm/mysql-core';
import { sql } from 'drizzle-orm';
import { user } from './auth';
import { item, uom } from './catalog';
import { branch, location } from './locations';
import { transactions } from './money';
import { supplier } from './suppliers';
import { customer } from './customers';
import { purchaseOrder, purchaseOrderLine } from './purchasing';
import { fiscalDevice } from './fiscal';
import { posShift, quote } from './sales';
import { deletionFields, orgRef, secureFields } from './fields';
import {
	ADJUSTMENT_REASONS,
	DOCUMENT_STATUSES,
	DOCUMENT_TYPES,
	LOT_STATUSES,
	SERIAL_STATUSES
} from '../../../constants';

/**
 * One batch of one item, as printed on the pack: lot number and expiry date.
 *
 * Whether a lot is *expired* is read off `expiryDate` against today, never stored: a status column
 * would need a job to flip it at midnight, and a missed run would let expired stock be issued.
 * `status` holds only what a person decides — pull it (quarantine) or a recall notice named it.
 */
export const lot = mysqlTable(
	'lot',
	{
		id: int('id').autoincrement().primaryKey(),
		orgId: orgRef(),
		itemId: int('item_id')
			.notNull()
			.references(() => item.id, { onDelete: 'restrict' }),
		lotNumber: varchar('lot_number', { length: 60 }).notNull(),
		// `mode: 'string'`: a calendar day, never shifted through a time zone.
		expiryDate: date('expiry_date', { mode: 'string' }),
		status: mysqlEnum('status', LOT_STATUSES).notNull().default('available'),
		/** Who delivered this batch — what a recall is traced back to. */
		supplierId: int('supplier_id').references(() => supplier.id, { onDelete: 'restrict' }),
		note: varchar('note', { length: 255 }),
		createdAt: timestamp('created_at').defaultNow().notNull(),
		updatedAt: timestamp('updated_at')
			.default(sql`CURRENT_TIMESTAMP(3) on update CURRENT_TIMESTAMP(3)`)
			.notNull()
	},
	(table) => [
		uniqueIndex('lot_item_number_idx').on(table.itemId, table.lotNumber),
		index('lot_org_expiry_idx').on(table.orgId, table.expiryDate)
	]
);

/** One physical unit of a serial-tracked item. */
export const serialUnit = mysqlTable(
	'serial_unit',
	{
		id: int('id').autoincrement().primaryKey(),
		orgId: orgRef(),
		itemId: int('item_id')
			.notNull()
			.references(() => item.id, { onDelete: 'restrict' }),
		serialNumber: varchar('serial_number', { length: 80 }).notNull(),
		lotId: int('lot_id').references(() => lot.id, { onDelete: 'set null' }),
		/** Who delivered this unit — the warranty claim goes to them. */
		supplierId: int('supplier_id').references(() => supplier.id, { onDelete: 'restrict' }),
		status: mysqlEnum('status', SERIAL_STATUSES).notNull().default('in_stock'),
		/** Where it is while `in_stock`; null once it has left. */
		locationId: int('location_id').references(() => location.id, { onDelete: 'set null' }),
		createdAt: timestamp('created_at').defaultNow().notNull(),
		updatedAt: timestamp('updated_at')
			.default(sql`CURRENT_TIMESTAMP(3) on update CURRENT_TIMESTAMP(3)`)
			.notNull()
	},
	(table) => [uniqueIndex('serial_item_number_idx').on(table.itemId, table.serialNumber)]
);

/**
 * A stock document: the paper a storekeeper fills in. Drafted, then posted.
 *
 * Posting is the only thing that changes stock (`$lib/server/stock/post`). A posted document is
 * never edited; a mistake is corrected by another document, so the ledger always explains itself.
 *
 * Purchasing and sales documents in later phases post through the same service, so they share the
 * ledger rather than keeping their own quantities.
 */
export const stockDocument = mysqlTable(
	'stock_document',
	{
		id: int('id').autoincrement().primaryKey(),
		orgId: orgRef(),
		type: mysqlEnum('type', DOCUMENT_TYPES).notNull(),
		status: mysqlEnum('status', DOCUMENT_STATUSES).notNull().default('draft'),
		/** Assigned when posted, e.g. `ADD-GRN-2019-00042`. Drafts have none, so no numbers are skipped. */
		number: varchar('number', { length: 40 }),
		/** Derived from the locations; the branch whose number sequence the document uses. */
		branchId: int('branch_id')
			.notNull()
			.references(() => branch.id, { onDelete: 'restrict' }),
		docDate: date('doc_date', { mode: 'string' }).notNull(),
		/** Where stock leaves from: issues, transfers, and adjustments (their one location). */
		fromLocationId: int('from_location_id').references(() => location.id, {
			onDelete: 'restrict'
		}),
		/** Where stock arrives: receipts and transfers. */
		toLocationId: int('to_location_id').references(() => location.id, { onDelete: 'restrict' }),
		/** The supplier's invoice or delivery note number, a requisition number... */
		reference: varchar('reference', { length: 80 }),
		/** Receipts: who delivered it. Required to post a receipt. */
		supplierId: int('supplier_id').references(() => supplier.id, { onDelete: 'restrict' }),
		/** Who it went to (issues), as written on the paper. Receipts use `supplierId` instead. */
		party: varchar('party', { length: 160 }),
		/** Issues: the customer, when the sale was to someone on the customer list. Optional. */
		customerId: int('customer_id').references(() => customer.id, { onDelete: 'restrict' }),
		// ── Fiscal receipt and e-invoice (sales and customer returns). All optional. ──
		fiscalDeviceId: int('fiscal_device_id').references(() => fiscalDevice.id, {
			onDelete: 'set null'
		}),
		/** The FS No. the device printed. */
		fiscalReceiptNumber: varchar('fiscal_receipt_number', { length: 30 }),
		/** The device's registration code (MRC), as printed on the receipt. */
		fiscalMachineCode: varchar('fiscal_machine_code', { length: 30 }),
		fiscalStatus: mysqlEnum('fiscal_status', ['pending', 'printed', 'manual', 'failed']),
		fiscalPrintedAt: datetime('fiscal_printed_at'),
		fiscalError: varchar('fiscal_error', { length: 255 }),
		einvoiceStatus: mysqlEnum('einvoice_status', [
			'submitted',
			'accepted',
			'rejected',
			'failed',
			'cancelled'
		]),
		/** The invoice reference number the tax office issued. */
		einvoiceIrn: varchar('einvoice_irn', { length: 120 }),
		/** What the invoice's QR code encodes. */
		einvoiceQr: text('einvoice_qr'),
		einvoiceSubmittedAt: datetime('einvoice_submitted_at'),
		einvoiceError: varchar('einvoice_error', { length: 255 }),
		/** The tax office's reply, as received, for the record. */
		einvoiceResponse: text('einvoice_response'),
		/** A sale made from a proforma, or rung up at a till during a shift. Optional. */
		quoteId: int('quote_id').references((): AnyMySqlColumn => quote.id, { onDelete: 'set null' }),
		shiftId: int('shift_id').references((): AnyMySqlColumn => posShift.id, {
			onDelete: 'set null'
		}),
		/** Returns: the sale or delivery being returned. */
		returnOfId: int('return_of_id').references((): AnyMySqlColumn => stockDocument.id, {
			onDelete: 'restrict'
		}),
		reason: mysqlEnum('reason', ADJUSTMENT_REASONS),
		note: text('note'),
		/**
		 * The money that went with it: what was paid for a delivery, taken for a sale. Nullable —
		 * a transfer moves no money, and a delivery is often paid days later.
		 */
		transactionId: int('transaction_id').references(() => transactions.id, {
			onDelete: 'set null'
		}),
		/** Receipts: the purchase order this delivery is against. */
		purchaseOrderId: int('purchase_order_id').references((): AnyMySqlColumn => purchaseOrder.id, {
			onDelete: 'restrict'
		}),
		postedAt: datetime('posted_at'),
		postedBy: varchar('posted_by', { length: 255 }).references(() => user.id, {
			onDelete: 'set null'
		}),
		...secureFields
	},
	(table) => [
		uniqueIndex('stock_document_number_idx').on(table.orgId, table.number),
		index('stock_document_org_status_idx').on(table.orgId, table.status, table.type),
		index('stock_document_customer_idx').on(table.customerId)
	]
);

/**
 * One line of a document, as entered: in whatever unit the paper uses. Converted to base units
 * only when posted, so a unit's factor is read at the moment the stock actually moves.
 */
export const stockDocumentLine = mysqlTable(
	'stock_document_line',
	{
		id: int('id').autoincrement().primaryKey(),
		orgId: orgRef(),
		documentId: int('document_id')
			.notNull()
			.references(() => stockDocument.id, { onDelete: 'cascade' }),
		itemId: int('item_id')
			.notNull()
			.references(() => item.id, { onDelete: 'restrict' }),
		/** The unit `quantity` is in. The item's base unit or one of its `item_unit` rows. */
		uomId: int('uom_id')
			.notNull()
			.references(() => uom.id, { onDelete: 'restrict' }),
		/** Positive, except on adjustments, where the sign says add or remove. */
		quantity: decimal('quantity', { precision: 18, scale: 4, mode: 'number' }).notNull(),
		/** Per `uomId`. Receipts and positive adjustments; defaults to the average cost when empty. */
		unitCost: decimal('unit_cost', { precision: 18, scale: 4, mode: 'number' }),
		/**
		 * Issues: what the line was sold for, per `uomId`. Defaults to the item's list price. A sale
		 * to a named customer needs it on every line — it is what the customer owes.
		 */
		unitPrice: decimal('unit_price', { precision: 18, scale: 4, mode: 'number' }),
		/** The price before a discount, when the line was discounted. Optional. */
		listPrice: decimal('list_price', { precision: 18, scale: 4, mode: 'number' }),
		/**
		 * VAT on this line, in percent: fixed when the document is posted (sales and receipts) or
		 * copied from the line returned. Empty on a draft, and on anything that is not bought or sold.
		 */
		vatRate: decimal('vat_rate', { precision: 5, scale: 2, mode: 'number' }),
		/** Turnover tax on this line, in percent, fixed at posting like `vatRate`. Optional. */
		totRate: decimal('tot_rate', { precision: 5, scale: 2, mode: 'number' }),
		/** Returns: the line of the original document this returns part of. */
		returnOfLineId: int('return_of_line_id').references(
			(): AnyMySqlColumn => stockDocumentLine.id,
			{ onDelete: 'restrict' }
		),
		/** Issues and transfers: take from this lot. Empty means first-expiry-first-out. */
		lotId: int('lot_id').references(() => lot.id, { onDelete: 'restrict' }),
		/** Receipts and positive adjustments: the lot being brought in. */
		lotNumber: varchar('lot_number', { length: 60 }),
		expiryDate: date('expiry_date', { mode: 'string' }),
		/** Serial numbers, one per line, for serial-tracked items. */
		serials: text('serials'),
		/**
		 * The order line this receipt line delivers; same item and unit. Its foreign key is declared
		 * below with a short name: the generated one is 68 characters, over MySQL's limit of 64.
		 */
		purchaseOrderLineId: int('purchase_order_line_id'),
		note: varchar('note', { length: 255 }),
		...deletionFields
	},
	(table) => [
		index('stock_document_line_doc_idx').on(table.documentId),
		foreignKey({
			name: 'stock_document_line_po_line_fk',
			columns: [table.purchaseOrderLineId],
			foreignColumns: [purchaseOrderLine.id]
		}).onDelete('restrict')
	]
);

export const MOVEMENT_KINDS = [
	'receipt',
	'issue',
	'transfer_out',
	'transfer_in',
	'adjustment_in',
	'adjustment_out',
	'sales_return',
	'purchase_return'
] as const;

/**
 * The ledger. Append-only: one row per change in quantity, in base units, signed.
 *
 * Every figure the system shows about stock can be rebuilt from this table. `stock_balance` is a
 * cache of it that posting keeps in step inside the same transaction.
 */
export const stockMovement = mysqlTable(
	'stock_movement',
	{
		id: int('id').autoincrement().primaryKey(),
		orgId: orgRef(),
		kind: mysqlEnum('kind', MOVEMENT_KINDS).notNull(),
		itemId: int('item_id')
			.notNull()
			.references(() => item.id, { onDelete: 'restrict' }),
		locationId: int('location_id')
			.notNull()
			.references(() => location.id, { onDelete: 'restrict' }),
		lotId: int('lot_id').references(() => lot.id, { onDelete: 'restrict' }),
		serialUnitId: int('serial_unit_id').references(() => serialUnit.id, { onDelete: 'restrict' }),
		/**
		 * The supplier these goods came from: the receipt's supplier coming in; going out, the
		 * serial unit's, else the lot's, else the item's main supplier.
		 */
		supplierId: int('supplier_id')
			.notNull()
			.references(() => supplier.id, { onDelete: 'restrict' }),
		/** Base units. Positive in, negative out. */
		quantity: decimal('quantity', { precision: 18, scale: 4, mode: 'number' }).notNull(),
		/** Per base unit, at the time of the movement: what the stock was valued at. */
		unitCost: decimal('unit_cost', { precision: 18, scale: 4, mode: 'number' }).notNull(),
		documentId: int('document_id')
			.notNull()
			.references(() => stockDocument.id, { onDelete: 'restrict' }),
		documentLineId: int('document_line_id').references(() => stockDocumentLine.id, {
			onDelete: 'restrict'
		}),
		docDate: date('doc_date', { mode: 'string' }).notNull(),
		createdBy: varchar('created_by', { length: 255 }).references(() => user.id, {
			onDelete: 'set null'
		}),
		createdAt: timestamp('created_at', { fsp: 3 }).defaultNow().notNull()
	},
	(table) => [
		index('stock_movement_item_idx').on(table.orgId, table.itemId, table.id),
		index('stock_movement_location_idx').on(table.locationId, table.itemId),
		index('stock_movement_document_idx').on(table.documentId),
		index('stock_movement_supplier_idx').on(table.supplierId, table.kind)
	]
);

/**
 * What is on hand, per location, item and lot. A cache of `stock_movement`, written only by the
 * posting service in the same transaction as the movements it sums.
 *
 * `lotKey` is `lotId` or 0. It exists because MySQL lets a unique index hold any number of rows
 * whose key column is NULL, so (location, item, NULL) could not be kept to one row otherwise.
 */
export const stockBalance = mysqlTable(
	'stock_balance',
	{
		id: int('id').autoincrement().primaryKey(),
		orgId: orgRef(),
		locationId: int('location_id')
			.notNull()
			.references(() => location.id, { onDelete: 'restrict' }),
		itemId: int('item_id')
			.notNull()
			.references(() => item.id, { onDelete: 'restrict' }),
		lotId: int('lot_id').references(() => lot.id, { onDelete: 'restrict' }),
		lotKey: int('lot_key').notNull().default(0),
		quantity: decimal('quantity', { precision: 18, scale: 4, mode: 'number' }).notNull().default(0),
		updatedAt: timestamp('updated_at')
			.default(sql`CURRENT_TIMESTAMP(3) on update CURRENT_TIMESTAMP(3)`)
			.notNull()
	},
	(table) => [
		uniqueIndex('stock_balance_key_idx').on(table.locationId, table.itemId, table.lotKey),
		index('stock_balance_org_item_idx').on(table.orgId, table.itemId)
	]
);

/**
 * The last number issued per branch, document type and Ethiopian fiscal year. Locked with
 * `FOR UPDATE` while a document is posted, so two storekeepers posting at once cannot draw the
 * same number.
 */
export const numberSequence = mysqlTable(
	'number_sequence',
	{
		id: int('id').autoincrement().primaryKey(),
		orgId: orgRef(),
		branchId: int('branch_id')
			.notNull()
			.references(() => branch.id, { onDelete: 'cascade' }),
		docType: varchar('doc_type', { length: 20 }).notNull(),
		fiscalYear: int('fiscal_year').notNull(),
		lastNumber: int('last_number').notNull().default(0)
	},
	(table) => [
		uniqueIndex('number_sequence_key_idx').on(table.branchId, table.docType, table.fiscalYear)
	]
);
