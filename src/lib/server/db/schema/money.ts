import {
	date,
	datetime,
	decimal,
	index,
	int,
	mysqlEnum,
	mysqlTable,
	timestamp,
	uniqueIndex,
	varchar
} from 'drizzle-orm/mysql-core';
import { user } from './auth';
import { branch } from './locations';
import { supplier } from './suppliers';
import { deletionFields, lesserFields, orgRef, secureFields } from './fields';
import {
	PAYMENT_KINDS,
	TRANSACTION_DIRECTIONS,
	TRANSACTION_PURPOSES,
	TRANSACTION_STATUSES
} from '../../../constants';

/** How money moves: Cash, Telebirr, CBE Birr, a bank account, cheques. Each business keeps its own list. */
export const paymentMethod = mysqlTable(
	'payment_method',
	{
		id: int('id').autoincrement().primaryKey(),
		orgId: orgRef(),
		name: varchar('name', { length: 60 }).notNull(),
		kind: mysqlEnum('kind', PAYMENT_KINDS).notNull().default('other'),
		/** The business's own account or wallet number, for matching statements. */
		accountNumber: varchar('account_number', { length: 60 }),
		...lesserFields
	},
	(table) => [uniqueIndex('payment_method_org_name_idx').on(table.orgId, table.name)]
);

/**
 * One movement of money, in or out. Anything that involves money — a stock document now, sales
 * and purchase invoices, expenses and leases later — points here with a nullable
 * `transaction_id`, so every birr the business moved can be listed, filtered and totalled in one
 * place.
 *
 * Never deleted: a mistake is voided with a reason, so the record of what was entered survives.
 * `verified` means somebody checked the money really arrived or left — the bank statement or the
 * Telebirr SMS, not only a screenshot — and must be somebody other than whoever recorded it.
 */
export const transactions = mysqlTable(
	'transactions',
	{
		id: int('id').autoincrement().primaryKey(),
		orgId: orgRef(),
		branchId: int('branch_id').references(() => branch.id, { onDelete: 'set null' }),
		direction: mysqlEnum('direction', TRANSACTION_DIRECTIONS).notNull(),
		/** Always positive; `direction` says which way. */
		amount: decimal('amount', { precision: 14, scale: 2, mode: 'number' }).notNull(),
		/** The day the money moved, which is not when it was typed in. */
		occurredOn: date('occurred_on', { mode: 'string' }).notNull(),
		paymentMethodId: int('payment_method_id').references(() => paymentMethod.id, {
			onDelete: 'set null'
		}),
		purpose: mysqlEnum('purpose', TRANSACTION_PURPOSES).notNull().default('other'),
		/** The receipt or invoice number on the paper: a fiscal receipt, a supplier's invoice. */
		receiptNumber: varchar('receipt_number', { length: 60 }),
		/** The payment's own reference: a bank FT number, a Telebirr transaction ID, a cheque number. */
		reference: varchar('reference', { length: 100 }),
		/** Who paid or was paid. */
		party: varchar('party', { length: 160 }),
		/** The supplier paid, when it was one: what the supplier's balance is worked out from. */
		supplierId: int('supplier_id').references(() => supplier.id, { onDelete: 'restrict' }),
		description: varchar('description', { length: 255 }),
		status: mysqlEnum('status', TRANSACTION_STATUSES).notNull().default('recorded'),
		verifiedBy: varchar('verified_by', { length: 255 }).references(() => user.id, {
			onDelete: 'set null'
		}),
		verifiedAt: datetime('verified_at'),
		voidReason: varchar('void_reason', { length: 255 }),
		...secureFields
	},
	(table) => [
		index('transactions_org_date_idx').on(table.orgId, table.occurredOn),
		index('transactions_org_reference_idx').on(table.orgId, table.reference),
		index('transactions_supplier_idx').on(table.supplierId)
	]
);

/** A screenshot or PDF backing a transaction: the transfer confirmation, the receipt, the cheque. */
export const transactionAttachment = mysqlTable(
	'transaction_attachment',
	{
		id: int('id').autoincrement().primaryKey(),
		orgId: orgRef(),
		transactionId: int('transaction_id')
			.notNull()
			.references(() => transactions.id, { onDelete: 'cascade' }),
		/** The stored name, from the kit's `saveUploadedFile`. */
		fileName: varchar('file_name', { length: 100 }).notNull(),
		originalName: varchar('original_name', { length: 255 }),
		mimeType: varchar('mime_type', { length: 60 }),
		sizeBytes: int('size_bytes'),
		uploadedBy: varchar('uploaded_by', { length: 255 }).references(() => user.id, {
			onDelete: 'set null'
		}),
		createdAt: timestamp('created_at').defaultNow().notNull(),
		...deletionFields
	},
	(table) => [
		index('transaction_attachment_txn_idx').on(table.transactionId),
		uniqueIndex('transaction_attachment_file_idx').on(table.fileName)
	]
);
