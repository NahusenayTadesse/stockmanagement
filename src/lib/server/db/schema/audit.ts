import { customType, int, mysqlTable, timestamp, varchar, index } from 'drizzle-orm/mysql-core';

/**
 * JSON kept in a LONGTEXT column. MariaDB's own `JSON` type *is* LONGTEXT, plus a
 * `CHECK (json_valid(...))` constraint — and drizzle-kit cannot introspect MariaDB check
 * constraints: `db:push` exits 1 with no message at "check constraints fetching". Same storage,
 * no constraint, and the value still goes in and comes out as an object.
 */
export const jsonText = customType<{ data: unknown; driverData: string | null }>({
	dataType: () => 'longtext',
	toDriver: (value) => (value === null || value === undefined ? null : JSON.stringify(value)),
	fromDriver: (value) => (value === null ? null : JSON.parse(value))
});
import { user } from './auth';

/** The kit's audit trail (`recordAudit`). Columns are the ones the kit writes. */
export const auditLog = mysqlTable(
	'audit_log',
	{
		id: int('id').autoincrement().primaryKey(),
		userId: varchar('user_id', { length: 255 }).references(() => user.id, { onDelete: 'set null' }),
		action: varchar('action', { length: 20 }).notNull(),
		tableName: varchar('table_name', { length: 64 }).notNull(),
		recordId: varchar('record_id', { length: 64 }).notNull(),
		changes: jsonText('changes'),
		ipAddress: varchar('ip_address', { length: 45 }),
		branchId: int('branch_id'),
		createdAt: timestamp('created_at').defaultNow().notNull()
	},
	(table) => [index('audit_table_record_idx').on(table.tableName, table.recordId)]
);
