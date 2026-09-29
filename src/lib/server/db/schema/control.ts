import {
	date,
	datetime,
	decimal,
	index,
	int,
	mysqlEnum,
	mysqlTable,
	text,
	timestamp,
	varchar,
	type AnyMySqlColumn
} from 'drizzle-orm/mysql-core';
import { user } from './auth';
import { item, uom } from './catalog';
import { branch, location } from './locations';
import { purchaseOrder } from './purchasing';
import { stockCount } from './counts';
import { stockDocument } from './stock';
import { deletionFields, orgRef, secureFields } from './fields';
import { APPROVAL_KINDS, APPROVAL_STATUSES, REQUISITION_STATUSES } from '../../../constants';

/**
 * A department asking the store for stock: the ward, the kitchen, the site office. Written and
 * submitted by the department, approved (quantities may be cut) by someone who may, then filled
 * by an ordinary issue from the store, which points back at it.
 */
export const requisition = mysqlTable(
	'requisition',
	{
		id: int('id').autoincrement().primaryKey(),
		orgId: orgRef(),
		branchId: int('branch_id')
			.notNull()
			.references(() => branch.id, { onDelete: 'restrict' }),
		/** Given when submitted, e.g. `ADD-REQ-2019-00012`. */
		number: varchar('number', { length: 40 }),
		status: mysqlEnum('status', REQUISITION_STATUSES).notNull().default('draft'),
		/** Who is asking: a department, ward, project or site, as the business names them. */
		department: varchar('department', { length: 120 }).notNull(),
		requestDate: date('request_date', { mode: 'string' }).notNull(),
		neededBy: date('needed_by', { mode: 'string' }),
		/** The store it is to come from. */
		locationId: int('location_id')
			.notNull()
			.references(() => location.id, { onDelete: 'restrict' }),
		note: text('note'),
		submittedAt: datetime('submitted_at'),
		submittedBy: varchar('submitted_by', { length: 255 }).references(() => user.id, {
			onDelete: 'set null'
		}),
		decidedAt: datetime('decided_at'),
		decidedBy: varchar('decided_by', { length: 255 }).references(() => user.id, {
			onDelete: 'set null'
		}),
		decisionNote: varchar('decision_note', { length: 255 }),
		/** The issue that filled it. */
		issueId: int('issue_id').references((): AnyMySqlColumn => stockDocument.id, {
			onDelete: 'set null'
		}),
		...secureFields
	},
	(table) => [index('requisition_org_status_idx').on(table.orgId, table.status)]
);

export const requisitionLine = mysqlTable(
	'requisition_line',
	{
		id: int('id').autoincrement().primaryKey(),
		orgId: orgRef(),
		requisitionId: int('requisition_id')
			.notNull()
			.references(() => requisition.id, { onDelete: 'cascade' }),
		itemId: int('item_id')
			.notNull()
			.references(() => item.id, { onDelete: 'restrict' }),
		uomId: int('uom_id')
			.notNull()
			.references(() => uom.id, { onDelete: 'restrict' }),
		quantity: decimal('quantity', { precision: 18, scale: 4, mode: 'number' }).notNull(),
		/** What the approver allowed, in the same unit. Empty until decided: all of it. */
		approvedQuantity: decimal('approved_quantity', { precision: 18, scale: 4, mode: 'number' }),
		note: varchar('note', { length: 255 }),
		...deletionFields
	},
	(table) => [index('requisition_line_req_idx').on(table.requisitionId)]
);

/**
 * Something that waits for a second person: an adjustment or count worth more than the business
 * allows one person to post, a write-off, a large purchase order. The person who asked cannot
 * approve it. Approving does the thing, in the approver's name.
 */
export const approvalRequest = mysqlTable(
	'approval_request',
	{
		id: int('id').autoincrement().primaryKey(),
		orgId: orgRef(),
		kind: mysqlEnum('kind', APPROVAL_KINDS).notNull(),
		status: mysqlEnum('status', APPROVAL_STATUSES).notNull().default('pending'),
		documentId: int('document_id').references(() => stockDocument.id, { onDelete: 'cascade' }),
		countId: int('count_id').references(() => stockCount.id, { onDelete: 'cascade' }),
		purchaseOrderId: int('purchase_order_id').references(() => purchaseOrder.id, {
			onDelete: 'cascade'
		}),
		/** What it is worth, in birr, when asked. */
		value: decimal('value', { precision: 14, scale: 2, mode: 'number' }).notNull(),
		/** Why it needs approval, in words. */
		reason: varchar('reason', { length: 255 }).notNull(),
		requestedBy: varchar('requested_by', { length: 255 }).references(() => user.id, {
			onDelete: 'set null'
		}),
		requestedAt: timestamp('requested_at').defaultNow().notNull(),
		decidedBy: varchar('decided_by', { length: 255 }).references(() => user.id, {
			onDelete: 'set null'
		}),
		decidedAt: datetime('decided_at'),
		decisionNote: varchar('decision_note', { length: 255 })
	},
	(table) => [index('approval_request_org_status_idx').on(table.orgId, table.status)]
);
