import type { ColumnDef } from '@tanstack/table-core';
import { renderComponent } from '@nahu/admin-kit/components/ui/data-table/index.js';
import DataTableLinks from '@nahu/admin-kit/components/Table/data-table-links.svelte';
import { formatETB } from '@nahu/admin-kit/global';
import { dateTimeCell, sortable, statusCell, textColumn } from '$lib/table';
import { m } from '$lib/paraglide/messages.js';
import type { PageData } from './$types';

type Row = PageData['shifts'][number];

/** An amount the drawer held or should have: "—" before the shift is counted. */
const drawer = (value: unknown) => (value == null ? '—' : formatETB(Number(value)));

export const columns: ColumnDef<Row>[] = [
	{
		accessorKey: 'id',
		get header() {
			return m.sales_shift();
		},
		cell: ({ row }) =>
			renderComponent(DataTableLinks, {
				id: row.original.id,
				name: `#${row.original.id}`,
				entity: 'shift'
			})
	},
	textColumn<Row>('cashier', m.sales_cashier),
	textColumn<Row>('location', m.sales_till_at),
	{
		accessorKey: 'openedAt',
		header: sortable(m.sales_opened),
		cell: dateTimeCell
	},
	{
		accessorKey: 'closedAt',
		header: sortable(m.sales_closed),
		cell: (info) => (info.getValue() ? dateTimeCell(info) : m.sales_shift_open())
	},
	{
		accessorKey: 'expectedCash',
		get header() {
			return m.sales_cash_expected();
		},
		cell: (info) => drawer(info.getValue())
	},
	{
		accessorKey: 'countedCash',
		get header() {
			return m.sales_cash_counted();
		},
		cell: (info) => drawer(info.getValue())
	},
	{
		accessorKey: 'difference',
		meta: { align: 'right' },
		header: sortable(m.sales_over_short),
		cell: (info) => {
			const v = info.getValue() as number | null;
			return v == null ? '—' : v === 0 ? m.sales_exact() : `${v > 0 ? '+' : ''}${formatETB(v)}`;
		}
	},
	{
		accessorKey: 'status',
		get header() {
			return m.common_status();
		},
		cell: (info) => {
			const status = info.getValue() as 'open' | 'closed';
			return statusCell(status, status === 'open' ? m.sales_shift_open() : m.sales_shift_closed());
		}
	}
];
