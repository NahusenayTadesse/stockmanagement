import type { ColumnDef } from '@tanstack/table-core';
import { renderComponent } from '@nahu/admin-kit/components/ui/data-table/index.js';
import DataTableLinks from '@nahu/admin-kit/components/Table/data-table-links.svelte';
import DataTableSort from '@nahu/admin-kit/components/Table/data-table-sort.svelte';
import ExpiryCell from '@nahu/admin-kit/components/Table/expiry-cell.svelte';
import { formatETB } from '@nahu/admin-kit/global';
import { qty } from '$lib/format';
import type { PageData } from './$types';

type Row = PageData['rows'][number];

const sortable = (name: string) =>
	(({ column }) =>
		renderComponent(DataTableSort, {
			name,
			onclick: column.getToggleSortingHandler()
		})) satisfies ColumnDef<Row>['header'];

export const columns: ColumnDef<Row>[] = [
	{
		accessorKey: 'item',
		header: sortable('Item'),
		cell: ({ row }) =>
			renderComponent(DataTableLinks, {
				id: row.original.itemId,
				name: row.original.item,
				entity: 'item'
			})
	},
	{ accessorKey: 'sku', header: 'Code' },
	{ accessorKey: 'category', header: sortable('Category'), cell: (info) => info.getValue() ?? '—' },
	{ accessorKey: 'branch', header: sortable('Branch') },
	{ accessorKey: 'location', header: sortable('Location') },
	{ accessorKey: 'lotNumber', header: 'Lot', cell: (info) => info.getValue() ?? '—' },
	{
		accessorKey: 'expiryDate',
		header: sortable('Expiry'),
		cell: ({ row }) =>
			renderComponent(ExpiryCell, {
				expiresOn: row.original.expiryDate,
				warningDays: row.original.warningDays,
				noneText: '—'
			})
	},
	{
		accessorKey: 'quantity',
		header: sortable('Quantity'),
		cell: ({ row }) => qty(row.original.quantity, row.original.unit)
	},
	{
		accessorKey: 'held',
		header: 'Held',
		cell: ({ row }) => (row.original.held ? qty(row.original.held, row.original.unit) : '—')
	},
	{
		accessorKey: 'free',
		header: sortable('Free'),
		cell: ({ row }) => qty(row.original.free, row.original.unit)
	},
	{
		accessorKey: 'value',
		header: sortable('Value'),
		cell: (info) => formatETB(Number(info.getValue()))
	}
];
