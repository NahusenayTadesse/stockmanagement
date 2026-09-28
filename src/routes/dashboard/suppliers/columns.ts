import type { ColumnDef } from '@tanstack/table-core';
import { renderComponent } from '@nahu/admin-kit/components/ui/data-table/index.js';
import DataTableLinks from '@nahu/admin-kit/components/Table/data-table-links.svelte';
import DataTableSort from '@nahu/admin-kit/components/Table/data-table-sort.svelte';
import Statuses from '@nahu/admin-kit/components/Table/statuses.svelte';
import { ethiopianDate } from '@nahu/admin-kit/tableCells';
import { formatETB } from '@nahu/admin-kit/global';
import type { PageData } from './$types';

type Row = PageData['suppliers'][number];

const sortable = (name: string) =>
	(({ column }) =>
		renderComponent(DataTableSort, {
			name,
			onclick: column.getToggleSortingHandler()
		})) satisfies ColumnDef<Row>['header'];

export const columns: ColumnDef<Row>[] = [
	{
		accessorKey: 'name',
		header: sortable('Supplier'),
		cell: ({ row }) =>
			renderComponent(DataTableLinks, {
				id: row.original.id,
				name: row.original.name,
				entity: 'supplier'
			})
	},
	{
		accessorKey: 'phone',
		header: 'Phone',
		// Carried over from before suppliers were tracked, with no phone yet.
		cell: ({ row }) => row.original.phone || '⚠ missing'
	},
	{ accessorKey: 'email', header: 'Email', cell: (info) => info.getValue() ?? '' },
	{ accessorKey: 'address', header: 'Address', cell: (info) => info.getValue() ?? '' },
	{ accessorKey: 'items', header: sortable('Items') },
	{ accessorKey: 'deliveries', header: sortable('Deliveries') },
	{
		accessorKey: 'lastDelivery',
		header: sortable('Last delivery'),
		cell: (info) => (info.getValue() ? ethiopianDate(info.getValue()) : '—')
	},
	{
		accessorKey: 'received',
		header: sortable('Received'),
		cell: (info) => formatETB(Number(info.getValue()))
	},
	{
		accessorKey: 'paid',
		header: sortable('Paid'),
		cell: (info) => formatETB(Number(info.getValue()))
	},
	{
		accessorKey: 'owed',
		header: sortable('Owed'),
		cell: (info) => formatETB(Number(info.getValue()))
	},
	{
		accessorKey: 'status',
		header: 'Status',
		cell: ({ row }) =>
			renderComponent(Statuses, { status: row.original.status ? 'Active' : 'Inactive' })
	}
];
