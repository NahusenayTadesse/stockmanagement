import type { ColumnDef } from '@tanstack/table-core';
import { renderComponent } from '@nahu/admin-kit/components/ui/data-table/index.js';
import DataTableLinks from '@nahu/admin-kit/components/Table/data-table-links.svelte';
import { ethiopianDate } from '@nahu/admin-kit/tableCells';
import type { PageData } from './$types';

type Summary = PageData['report']['items'][number];
type Period = PageData['report']['periods'][number];

const itemLink = (row: { itemId: number; item: string }) =>
	renderComponent(DataTableLinks, { id: row.itemId, name: row.item, entity: 'item' });

export const summaryColumns: ColumnDef<Summary>[] = [
	{ accessorKey: 'item', header: 'Item', cell: ({ row }) => itemLink(row.original) },
	{ accessorKey: 'sku', header: 'Code' },
	{ accessorKey: 'location', header: 'Location' },
	{ id: 'now', header: 'Now', accessorFn: (r) => (r.stillOut ? 'Out of stock' : 'Back in stock') },
	{ accessorKey: 'times', header: 'Times out' },
	{ accessorKey: 'days', header: 'Days out (in period)' },
	{ accessorKey: 'lastOut', header: 'Last ran out', cell: (i) => ethiopianDate(i.getValue()) }
];

export const periodColumns: ColumnDef<Period>[] = [
	{ accessorKey: 'item', header: 'Item', cell: ({ row }) => itemLink(row.original) },
	{ accessorKey: 'sku', header: 'Code' },
	{ accessorKey: 'location', header: 'Location' },
	{ accessorKey: 'outFrom', header: 'Ran out', cell: (i) => ethiopianDate(i.getValue()) },
	{
		accessorKey: 'backIn',
		header: 'Back in stock',
		cell: (i) => (i.getValue() ? ethiopianDate(i.getValue()) : 'Still out')
	},
	{ accessorKey: 'days', header: 'Days out (in period)' }
];
