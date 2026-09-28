import type { ColumnDef } from '@tanstack/table-core';
import { renderComponent } from '@nahu/admin-kit/components/ui/data-table/index.js';
import DataTableLinks from '@nahu/admin-kit/components/Table/data-table-links.svelte';
import ExpiryCell from '@nahu/admin-kit/components/Table/expiry-cell.svelte';
import { ethiopianDate } from '@nahu/admin-kit/tableCells';
import { formatETB } from '@nahu/admin-kit/global';
import { MOVEMENT_LABELS, qty } from '$lib/format';
import type { PageData } from './$types';

type StockRow = PageData['stock'][number];
type CardRow = PageData['card'][number];

export const stockColumns: ColumnDef<StockRow>[] = [
	{ accessorKey: 'branch', header: 'Branch' },
	{ accessorKey: 'location', header: 'Location' },
	{ accessorKey: 'lotNumber', header: 'Lot', cell: (info) => info.getValue() ?? '—' },
	{
		accessorKey: 'expiryDate',
		header: 'Expiry',
		cell: ({ row }) =>
			renderComponent(ExpiryCell, {
				expiresOn: row.original.expiryDate,
				warningDays: row.original.warningDays,
				noneText: '—'
			})
	},
	{ accessorKey: 'lotStatus', header: 'Lot status', cell: (info) => info.getValue() ?? '—' },
	{
		accessorKey: 'quantity',
		header: 'Quantity',
		cell: ({ row }) => qty(row.original.quantity, row.original.unit)
	},
	{ accessorKey: 'value', header: 'Value', cell: (info) => formatETB(Number(info.getValue())) }
];

export const cardColumns: ColumnDef<CardRow>[] = [
	{ accessorKey: 'docDate', header: 'Date', cell: (info) => ethiopianDate(info.getValue()) },
	{
		accessorKey: 'number',
		header: 'Document',
		cell: ({ row }) =>
			renderComponent(DataTableLinks, {
				id: row.original.documentId,
				name: row.original.number ?? '—',
				entity: 'document'
			})
	},
	{
		accessorKey: 'kind',
		header: 'Movement',
		cell: (info) => MOVEMENT_LABELS[info.getValue() as string]
	},
	{ accessorKey: 'party', header: 'From / to', cell: (info) => info.getValue() ?? '' },
	{ accessorKey: 'location', header: 'Location' },
	{ accessorKey: 'lotNumber', header: 'Lot', cell: (info) => info.getValue() ?? '—' },
	{
		id: 'in',
		header: 'In',
		cell: ({ row }) => (Number(row.original.quantity) > 0 ? qty(row.original.quantity) : '')
	},
	{
		id: 'out',
		header: 'Out',
		cell: ({ row }) =>
			Number(row.original.quantity) < 0 ? qty(-Number(row.original.quantity)) : ''
	},
	{ accessorKey: 'balance', header: 'Balance', cell: (info) => qty(info.getValue() as number) },
	{
		accessorKey: 'unitCost',
		header: 'Unit cost',
		cell: (info) => formatETB(Number(info.getValue()))
	}
];
