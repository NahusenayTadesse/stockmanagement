import type { ColumnDef } from '@tanstack/table-core';
import type { PageData } from './$types';
import { m } from '$lib/paraglide/messages.js';
import { labels } from '$lib/format';
import { dateTimeCell, longText, statusCell } from '$lib/table';

type Row = PageData['log'][number];

export const STATUS_TEXT: Record<Row['status'], string> = labels({
	sent: m.admin_sms_st_sent,
	dry_run: m.admin_sms_st_dry_run,
	failed: m.admin_sms_st_failed,
	skipped: m.admin_sms_st_skipped
});

/** The badge colour for each: sent is done, test mode waits, failed is red, skipped is grey. */
const STATUS_TONE: Record<Row['status'], string> = {
	sent: 'completed',
	dry_run: 'pending',
	failed: 'cancelled',
	skipped: 'skipped'
};

/** What each message was for, as the log shows it. Unknown kinds show as stored. */
const KIND_TEXT: Record<string, string> = labels({
	sale: m.admin_sms_kind_sale,
	payment: m.admin_sms_kind_payment,
	reminder: m.admin_sms_kind_reminder,
	alert: m.admin_sms_kind_alert,
	transfer: m.admin_sms_kind_transfer,
	digest: m.admin_sms_kind_digest,
	quote: m.admin_sms_kind_quote,
	order: m.admin_sms_kind_order,
	custom: m.admin_sms_kind_custom,
	test: m.admin_sms_kind_test
});

export const columns: ColumnDef<Row>[] = [
	{
		accessorKey: 'createdAt',
		get header() {
			return m.admin_sms_col_when();
		},
		cell: dateTimeCell
	},
	{
		accessorKey: 'phone',
		get header() {
			return m.admin_sms_col_to();
		}
	},
	{
		id: 'who',
		get header() {
			return m.admin_sms_col_who();
		},
		accessorFn: (r) => r.customer ?? r.supplier ?? ''
	},
	{
		accessorKey: 'kind',
		get header() {
			return m.admin_sms_col_kind();
		},
		cell: (i) => KIND_TEXT[String(i.getValue())] ?? i.getValue()
	},
	{
		accessorKey: 'status',
		get header() {
			return m.common_status();
		},
		cell: ({ row }) =>
			statusCell(STATUS_TONE[row.original.status], STATUS_TEXT[row.original.status])
	},
	{
		accessorKey: 'error',
		get header() {
			return m.admin_sms_col_error();
		},
		cell: longText()
	},
	{
		accessorKey: 'body',
		get header() {
			return m.admin_sms_col_message();
		},
		cell: longText()
	},
	{
		accessorKey: 'units',
		get header() {
			return m.admin_sms_col_units();
		},
		cell: (i) => i.getValue() ?? ''
	}
];
