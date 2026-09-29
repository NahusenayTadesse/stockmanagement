import type { ColumnDef } from '@tanstack/table-core';
import { renderComponent } from '@nahu/admin-kit/components/ui/data-table/index.js';
import DataTableLinks from '@nahu/admin-kit/components/Table/data-table-links.svelte';
import { formatETB } from '@nahu/admin-kit/global';
import { qty } from '$lib/format';
import type { PageData } from './$types';

type Row = PageData['report']['rows'][number];

export const CLASS_NAMES: Record<string, string> = {
	A: 'A',
	B: 'B',
	C: 'C',
	none: 'Not used'
};

export function columns(basis: 'cost' | 'revenue'): ColumnDef<Row>[] {
	return [
		{ accessorKey: 'rank', header: '#', cell: (i) => i.getValue() ?? '—' },
		{
			accessorKey: 'item',
			header: 'Item',
			cell: ({ row }) =>
				renderComponent(DataTableLinks, {
					id: row.original.itemId,
					name: row.original.item,
					entity: 'item'
				})
		},
		{ accessorKey: 'sku', header: 'Code' },
		{ accessorKey: 'category', header: 'Category', cell: (i) => i.getValue() ?? '—' },
		{ id: 'class', header: 'Class', accessorFn: (r) => CLASS_NAMES[r.cls] },
		{
			accessorKey: 'quantity',
			header: basis === 'cost' ? 'Used' : 'Sold',
			cell: ({ row }) => qty(row.original.quantity, row.original.unit)
		},
		{
			accessorKey: 'value',
			header: basis === 'cost' ? 'Value used (cost)' : 'Sales (before VAT)',
			cell: (i) => formatETB(Number(i.getValue()))
		},
		{ accessorKey: 'share', header: 'Share', cell: (i) => `${i.getValue()}%` },
		{
			accessorKey: 'cumulative',
			header: 'Running total',
			cell: (i) => (i.getValue() === null ? '—' : `${i.getValue()}%`)
		},
		{
			accessorKey: 'onHand',
			header: 'On hand',
			cell: ({ row }) => qty(row.original.onHand, row.original.unit)
		},
		{
			accessorKey: 'stockValue',
			header: 'Stock value',
			cell: (i) => formatETB(Number(i.getValue()))
		}
	];
}
