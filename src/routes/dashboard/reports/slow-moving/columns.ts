import type { ColumnDef } from '@tanstack/table-core';
import { renderComponent } from '@nahu/admin-kit/components/ui/data-table/index.js';
import DataTableLinks from '@nahu/admin-kit/components/Table/data-table-links.svelte';
import { formatETB } from '@nahu/admin-kit/global';
import { ethiopianDate } from '@nahu/admin-kit/tableCells';
import { qty } from '$lib/format';
import type { PageData } from './$types';

type Row = PageData['report']['rows'][number];

export const STATUS_NAMES: Record<string, string> = { dead: 'Dead', slow: 'Slow' };

export const columns: ColumnDef<Row>[] = [
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
	{
		id: 'statusName',
		header: 'Status',
		accessorFn: (r) => STATUS_NAMES[r.status]
	},
	{
		accessorKey: 'idleDays',
		header: 'Days idle',
		cell: ({ row }) =>
			`${row.original.idleDays}${row.original.neverIssued ? ' (never issued)' : ''}`
	},
	{
		accessorKey: 'lastIssue',
		header: 'Last sold or used',
		cell: ({ row }) => (row.original.lastIssue ? ethiopianDate(row.original.lastIssue) : 'Never')
	},
	{
		accessorKey: 'lastReceipt',
		header: 'Last received',
		cell: ({ row }) => (row.original.lastReceipt ? ethiopianDate(row.original.lastReceipt) : '—')
	},
	{
		accessorKey: 'onHand',
		header: 'On hand',
		cell: ({ row }) => qty(row.original.onHand, row.original.unit)
	},
	{ accessorKey: 'value', header: 'Value at cost', cell: (i) => formatETB(Number(i.getValue())) }
];
