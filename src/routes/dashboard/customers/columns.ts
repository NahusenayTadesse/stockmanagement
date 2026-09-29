import type { ColumnDef } from '@tanstack/table-core';
import { renderComponent } from '@nahu/admin-kit/components/ui/data-table/index.js';
import DataTableLinks from '@nahu/admin-kit/components/Table/data-table-links.svelte';
import { formatETB } from '@nahu/admin-kit/global';
import { m } from '$lib/paraglide/messages.js';
import type { PageData } from './$types';
import { dateCell, longText, moneyCell, sortable, statusCell, textColumn } from '$lib/table';

type Row = PageData['customers'][number];

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
	textColumn<Row>('phone', m.common_phone),
	{
		accessorKey: 'address',
		get header() {
			return m.common_address();
		},
		cell: longText()
	},
	textColumn<Row>('tin', () => 'TIN'),
	{ accessorKey: 'purchases', header: sortable(m.sales_purchases) },
	{
		accessorKey: 'lastPurchase',
		header: sortable(m.sales_last_purchase),
		cell: (info) => (info.getValue() ? dateCell(info) : '—')
	},
	{
		accessorKey: 'taken',
		meta: { align: 'right' },
		header: sortable(m.sales_goods_at_cost),
		cell: moneyCell
	},
	{
		accessorKey: 'paid',
		meta: { align: 'right' },
		header: sortable(m.sales_paid),
		cell: moneyCell
	},
	{
		accessorKey: 'owed',
		meta: { align: 'right' },
		header: sortable(m.sales_owes),
		cell: ({ row }) =>
			row.original.owed < 0
				? m.sales_in_credit({ amount: formatETB(-row.original.owed) })
				: formatETB(row.original.owed) + (row.original.overLimit ? m.sales_over_limit_flag() : '')
	},
	{
		accessorKey: 'overdue',
		meta: { align: 'right' },
		header: sortable(m.sales_overdue),
		cell: (info) => (Number(info.getValue()) > 0 ? formatETB(Number(info.getValue())) : '—')
	},
	{
		accessorKey: 'creditLimit',
		meta: { align: 'right' },
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
			statusCell(
				row.original.status ? 'active' : 'inactive',
				row.original.status ? m.common_active() : m.common_inactive()
			)
	}
];
