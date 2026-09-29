import type { ColumnDef } from '@tanstack/table-core';
import type { PageData } from './$types';
import { m } from '$lib/paraglide/messages.js';
import { labels } from '$lib/format';

type Row = PageData['log'][number];

const when = (v: unknown) =>
	v ? new Date(v as string).toLocaleString('en-GB', { timeZone: 'Africa/Addis_Ababa' }) : '';

export const STATUS_TEXT: Record<Row['status'], string> = labels({
	sent: m.admin_sms_st_sent,
	dry_run: m.admin_sms_st_dry_run,
	failed: m.admin_sms_st_failed,
	skipped: m.admin_sms_st_skipped
});

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
		cell: (i) => when(i.getValue())
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
			STATUS_TEXT[row.original.status] + (row.original.error ? `: ${row.original.error}` : '')
	},
	{
		accessorKey: 'body',
		get header() {
			return m.admin_sms_col_message();
		}
	},
	{
		accessorKey: 'units',
		get header() {
			return m.admin_sms_col_units();
		},
		cell: (i) => i.getValue() ?? ''
	}
];
