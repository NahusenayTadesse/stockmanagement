import type { ColumnDef } from '@tanstack/table-core';
import { renderComponent } from '@nahu/admin-kit/components/ui/data-table/index.js';
import DataTableLinks from '@nahu/admin-kit/components/Table/data-table-links.svelte';
import { formatETB } from '@nahu/admin-kit/global';
import { ethiopianDate } from '@nahu/admin-kit/tableCells';
import { labels, qty } from '$lib/format';
import { m } from '$lib/paraglide/messages.js';
import type { PageData } from './$types';

type Row = PageData['report']['rows'][number];

export const STATUS_NAMES: Record<string, string> = labels({
	dead: m.reports_status_dead,
	slow: m.reports_status_slow
});

export const columns: ColumnDef<Row>[] = [
	{
		accessorKey: 'item',
		get header() {
			return m.common_item();
		},
		cell: ({ row }) =>
			renderComponent(DataTableLinks, {
				id: row.original.itemId,
				name: row.original.item,
				entity: 'item'
			})
	},
	{
		accessorKey: 'sku',
		get header() {
			return m.reports_col_code();
		}
	},
	{
		accessorKey: 'category',
		get header() {
			return m.reports_col_category();
		},
		cell: (i) => i.getValue() ?? '—'
	},
	{
		id: 'statusName',
		get header() {
			return m.common_status();
		},
		accessorFn: (r) => STATUS_NAMES[r.status]
	},
	{
		accessorKey: 'idleDays',
		get header() {
			return m.reports_col_days_idle();
		},
		cell: ({ row }) =>
			`${row.original.idleDays}${row.original.neverIssued ? ` ${m.reports_never_issued()}` : ''}`
	},
	{
		accessorKey: 'lastIssue',
		get header() {
			return m.reports_col_last_issue();
		},
		cell: ({ row }) =>
			row.original.lastIssue ? ethiopianDate(row.original.lastIssue) : m.reports_never()
	},
	{
		accessorKey: 'lastReceipt',
		get header() {
			return m.reports_col_last_receipt();
		},
		cell: ({ row }) => (row.original.lastReceipt ? ethiopianDate(row.original.lastReceipt) : '—')
	},
	{
		accessorKey: 'onHand',
		get header() {
			return m.reports_col_on_hand();
		},
		cell: ({ row }) => qty(row.original.onHand, row.original.unit)
	},
	{
		accessorKey: 'value',
		get header() {
			return m.reports_col_value_at_cost();
		},
		cell: (i) => formatETB(Number(i.getValue()))
	}
];
