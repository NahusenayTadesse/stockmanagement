import type { ColumnDef } from '@tanstack/table-core';
import { renderComponent } from '@nahu/admin-kit/components/ui/data-table/index.js';
import DataTableLinks from '@nahu/admin-kit/components/Table/data-table-links.svelte';
import DataTableSort from '@nahu/admin-kit/components/Table/data-table-sort.svelte';
import Statuses from '@nahu/admin-kit/components/Table/statuses.svelte';
import { ethiopianDate } from '@nahu/admin-kit/tableCells';
import { formatETB } from '@nahu/admin-kit/global';
import { m } from '$lib/paraglide/messages.js';
import type { PageData } from './$types';

type Row = PageData['customers'][number];

/** A sortable header, named in the viewer's language when it is drawn. */
const sortable = (name: () => string) =>
	(({ column }) =>
		renderComponent(DataTableSort, {
			name: name(),
			onclick: column.getToggleSortingHandler()
		})) satisfies ColumnDef<Row>['header'];

export const columns: ColumnDef<Row>[] = [
	{
		accessorKey: 'name',
		header: sortable(m.sales_customer),
		cell: ({ row }) =>
			renderComponent(DataTableLinks, {
				id: row.original.id,
				name: row.original.name,
				entity: 'customer'
			})
	},
	{
		accessorKey: 'phone',
		get header() {
			return m.common_phone();
		},
		cell: (info) => info.getValue() ?? ''
	},
	{
		accessorKey: 'address',
		get header() {
			return m.common_address();
		},
		cell: (info) => info.getValue() ?? ''
	},
	{ accessorKey: 'tin', header: 'TIN', cell: (info) => info.getValue() ?? '' },
	{ accessorKey: 'purchases', header: sortable(m.sales_purchases) },
	{
		accessorKey: 'lastPurchase',
		header: sortable(m.sales_last_purchase),
		cell: (info) => (info.getValue() ? ethiopianDate(info.getValue()) : '—')
	},
	{
		accessorKey: 'taken',
		header: sortable(m.sales_goods_at_cost),
		cell: (info) => formatETB(Number(info.getValue()))
	},
	{
		accessorKey: 'paid',
		header: sortable(m.sales_paid),
		cell: (info) => formatETB(Number(info.getValue()))
	},
	{
		accessorKey: 'owed',
		header: sortable(m.sales_owes),
		cell: ({ row }) =>
			row.original.owed < 0
				? m.sales_in_credit({ amount: formatETB(-row.original.owed) })
				: formatETB(row.original.owed) + (row.original.overLimit ? m.sales_over_limit_flag() : '')
	},
	{
		accessorKey: 'overdue',
		header: sortable(m.sales_overdue),
		cell: (info) => (Number(info.getValue()) > 0 ? formatETB(Number(info.getValue())) : '—')
	},
	{
		accessorKey: 'creditLimit',
		get header() {
			return m.sales_credit_limit();
		},
		cell: (info) =>
			info.getValue() == null
				? m.sales_no_limit()
				: Number(info.getValue()) === 0
					? m.sales_cash_only()
					: formatETB(Number(info.getValue()))
	},
	{
		accessorKey: 'status',
		get header() {
			return m.common_status();
		},
		cell: ({ row }) =>
			renderComponent(Statuses, {
				status: row.original.status ? 'active' : 'inactive',
				label: row.original.status ? m.common_active() : m.common_inactive()
			})
	}
];
