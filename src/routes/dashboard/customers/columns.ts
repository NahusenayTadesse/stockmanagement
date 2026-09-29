import type { ColumnDef } from '@tanstack/table-core';
import { renderComponent } from '@nahu/admin-kit/components/ui/data-table/index.js';
import DataTableLinks from '@nahu/admin-kit/components/Table/data-table-links.svelte';
import DataTableSort from '@nahu/admin-kit/components/Table/data-table-sort.svelte';
import Statuses from '@nahu/admin-kit/components/Table/statuses.svelte';
import { ethiopianDate } from '@nahu/admin-kit/tableCells';
import { formatETB } from '@nahu/admin-kit/global';
import type { PageData } from './$types';

type Row = PageData['customers'][number];

const sortable = (name: string) =>
	(({ column }) =>
		renderComponent(DataTableSort, {
			name,
			onclick: column.getToggleSortingHandler()
		})) satisfies ColumnDef<Row>['header'];

export const columns: ColumnDef<Row>[] = [
	{
		accessorKey: 'name',
		header: sortable('Customer'),
		cell: ({ row }) =>
			renderComponent(DataTableLinks, {
				id: row.original.id,
				name: row.original.name,
				entity: 'customer'
			})
	},
	{ accessorKey: 'phone', header: 'Phone', cell: (info) => info.getValue() ?? '' },
	{ accessorKey: 'address', header: 'Address', cell: (info) => info.getValue() ?? '' },
	{ accessorKey: 'tin', header: 'TIN', cell: (info) => info.getValue() ?? '' },
	{ accessorKey: 'purchases', header: sortable('Purchases') },
	{
		accessorKey: 'lastPurchase',
		header: sortable('Last purchase'),
		cell: (info) => (info.getValue() ? ethiopianDate(info.getValue()) : '—')
	},
	{
		accessorKey: 'taken',
		header: sortable('Goods at cost'),
		cell: (info) => formatETB(Number(info.getValue()))
	},
	{
		accessorKey: 'paid',
		header: sortable('Paid'),
		cell: (info) => formatETB(Number(info.getValue()))
	},
	{
		accessorKey: 'owed',
		header: sortable('Owes'),
		cell: ({ row }) =>
			row.original.owed < 0
				? `${formatETB(-row.original.owed)} in credit`
				: formatETB(row.original.owed) + (row.original.overLimit ? ' ⚠ over limit' : '')
	},
	{
		accessorKey: 'overdue',
		header: sortable('Overdue'),
		cell: (info) => (Number(info.getValue()) > 0 ? formatETB(Number(info.getValue())) : '—')
	},
	{
		accessorKey: 'creditLimit',
		header: 'Credit limit',
		cell: (info) =>
			info.getValue() == null
				? 'No limit'
				: Number(info.getValue()) === 0
					? 'Cash only'
					: formatETB(Number(info.getValue()))
	},
	{
		accessorKey: 'status',
		header: 'Status',
		cell: ({ row }) =>
			renderComponent(Statuses, { status: row.original.status ? 'Active' : 'Inactive' })
	}
];
