import { m } from '$lib/paraglide/messages.js';
import type { ColumnDef } from '@tanstack/table-core';
import { renderComponent } from '@nahu/admin-kit/components/ui/data-table/index.js';
import DataTableLinks from '@nahu/admin-kit/components/Table/data-table-links.svelte';
import DataTableSort from '@nahu/admin-kit/components/Table/data-table-sort.svelte';
import ExpiryCell from '@nahu/admin-kit/components/Table/expiry-cell.svelte';
import { formatETB } from '@nahu/admin-kit/global';
import { qty } from '$lib/format';
import type { PageData } from './$types';

type Row = PageData['rows'][number];

/** A sortable header, named in the viewer's language when the table is drawn. */
const sortable = (name: () => string) =>
	(({ column }) =>
		renderComponent(DataTableSort, {
			name: name(),
			onclick: column.getToggleSortingHandler()
		})) satisfies ColumnDef<Row>['header'];

export const columns: ColumnDef<Row>[] = [
	{
		accessorKey: 'item',
		header: sortable(m.common_item),
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
			return m.stock_col_code();
		}
	},
	{
		accessorKey: 'category',
		header: sortable(m.stock_col_category),
		cell: (info) => info.getValue() ?? '—'
	},
	{ accessorKey: 'branch', header: sortable(m.common_branch) },
	{ accessorKey: 'location', header: sortable(m.common_location) },
	{
		accessorKey: 'lotNumber',
		get header() {
			return m.stock_col_lot();
		},
		cell: (info) => info.getValue() ?? '—'
	},
	{
		accessorKey: 'expiryDate',
		header: sortable(m.stock_col_expiry),
		cell: ({ row }) =>
			renderComponent(ExpiryCell, {
				expiresOn: row.original.expiryDate,
				warningDays: row.original.warningDays,
				noneText: '—'
			})
	},
	{
		accessorKey: 'quantity',
		header: sortable(m.common_quantity),
		cell: ({ row }) => qty(row.original.quantity, row.original.unit)
	},
	{
		accessorKey: 'held',
		get header() {
			return m.stock_col_held();
		},
		cell: ({ row }) => (row.original.held ? qty(row.original.held, row.original.unit) : '—')
	},
	{
		accessorKey: 'free',
		header: sortable(m.stock_col_free),
		cell: ({ row }) => qty(row.original.free, row.original.unit)
	},
	{
		accessorKey: 'value',
		header: sortable(m.stock_col_value),
		cell: (info) => formatETB(Number(info.getValue()))
	}
];
