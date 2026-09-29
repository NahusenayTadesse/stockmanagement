import {
	boolean,
	datetime,
	int,
	mysqlEnum,
	mysqlTable,
	timestamp,
	varchar
} from 'drizzle-orm/mysql-core';
import { orgRef } from './fields';
import { branch } from './locations';

import { FISCAL_DEVICE_KINDS } from '../../../constants';

export { FISCAL_DEVICE_KINDS };

/**
 * A fiscal device: an MoR-registered sales register (cash register or fiscal printer) that prints
 * the legal receipt, with its FS No. and the machine's registration code (MRC).
 *
 * Entirely optional, and every column but the business may be empty: a business without one never
 * sees fiscal steps. `manual` means the cashier rings the sale up on the device and types the FS
 * No. back in; `datecs_tcp` drives a networked Datecs-protocol printer directly; `http_bridge`
 * hands the receipt to a vendor's bridge service for USB/serial devices.
 */
export const fiscalDevice = mysqlTable('fiscal_device', {
	id: int('id').autoincrement().primaryKey(),
	orgId: orgRef(),
	/** The branch whose sales it prints. Empty: any branch. */
	branchId: int('branch_id').references(() => branch.id, { onDelete: 'set null' }),
	name: varchar('name', { length: 100 }),
	kind: mysqlEnum('kind', FISCAL_DEVICE_KINDS),
	/** Machine registration code, printed on every fiscal receipt. */
	machineCode: varchar('machine_code', { length: 30 }),
	serialNumber: varchar('serial_number', { length: 40 }),
	/** datecs_tcp: the device's address on the network. */
	host: varchar('host', { length: 120 }),
	port: int('port'),
	/** http_bridge: the bridge's base URL, and its token (stored encrypted). */
	bridgeUrl: varchar('bridge_url', { length: 255 }),
	bridgeToken: varchar('bridge_token', { length: 512 }),
	/** Datecs: operator number and password (password stored encrypted), and till number. */
	operatorCode: varchar('operator_code', { length: 10 }),
	operatorPassword: varchar('operator_password', { length: 512 }),
	tillNumber: int('till_number'),
	/**
	 * Which of the device's tax groups each rate prints under, e.g. `15=A,0=B,exempt=C,tot=D`.
	 * Devices are programmed per business; empty uses that example.
	 */
	taxGroups: varchar('tax_groups', { length: 120 }),
	/** Print the fiscal receipt as soon as a sale is posted. */
	autoPrint: boolean('auto_print'),
	isActive: boolean('is_active'),
	lastStatus: varchar('last_status', { length: 255 }),
	lastCheckedAt: datetime('last_checked_at'),
	lastZReportAt: datetime('last_z_report_at'),
	createdAt: timestamp('created_at').defaultNow(),
	deletedAt: datetime('deleted_at'),
	/** Who removed it; stamped by the kit's soft delete. */
	deletedBy: varchar('deleted_by', { length: 255 })
});
