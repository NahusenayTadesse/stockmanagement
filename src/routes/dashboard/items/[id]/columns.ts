import { m } from '$lib/paraglide/messages.js';
import type { ColumnDef } from '@tanstack/table-core';
import { renderComponent } from '@nahu/admin-kit/components/ui/data-table/index.js';
import DataTableLinks from '@nahu/admin-kit/components/Table/data-table-links.svelte';
import ExpiryCell from '@nahu/admin-kit/components/Table/expiry-cell.svelte';
import { ethiopianDate } from '@nahu/admin-kit/tableCells';
import { formatETB } from '@nahu/admin-kit/global';
import { MOVEMENT_LABELS, qty } from '$lib/format';
import type { PageData } from './$types';
import { longText, NAME_LENGTH } from '$lib/cells';

type StockRow = PageData['stock'][number];
type CardRow = PageData['card'][number];

export const stockColumns: ColumnDef<StockRow>[] = [
	{
		accessorKey: 'branch',
		get header() {
			return m.common_branch();
		}
	},
	{
		accessorKey: 'location',
		get header() {
			return m.common_location();
		}
	},
	{
		accessorKey: 'lotNumber',
		get header() {
			return m.stock_col_lot();
		},
		cell: (info) => info.getValue() ?? '—'
	},
	{
		accessorKey: 'expiryDate',
		get header() {
			return m.stock_col_expiry();
		},
		cell: ({ row }) =>
			renderComponent(ExpiryCell, {
				expiresOn: row.original.expiryDate,
				warningDays: row.original.warningDays,
				noneText: '—'
			})
	},
	{
		accessorKey: 'lotStatus',
		get header() {
			return m.stock_lot_status();
		},
		cell: (info) => {
			const v = info.getValue() as string | null;
			return v === 'available'
				? m.stock_lot_state_available()
				: v === 'quarantine'
					? m.stock_lot_state_quarantine()
					: v === 'recalled'
						? m.stock_lot_state_recalled()
						: (v ?? '—');
		}
	},
	{
		accessorKey: 'quantity',
		get header() {
			return m.common_quantity();
		},
		cell: ({ row }) => qty(row.original.quantity, row.original.unit)
	},
	{
		accessorKey: 'value',
		get header() {
			return m.stock_col_value();
		},
		cell: (info) => formatETB(Number(info.getValue()))
	}
];

export const cardColumns: ColumnDef<CardRow>[] = [
	{
		accessorKey: 'docDate',
		get header() {
			return m.common_date();
		},
		cell: (info) => ethiopianDate(info.getValue())
	},
	{
		accessorKey: 'number',
		get header() {
			return m.stock_document();
		},
		cell: ({ row }) =>
			renderComponent(DataTableLinks, {
				id: row.original.documentId,
				name: row.original.number ?? '—',
				entity: 'document'
			})
	},
	{
		accessorKey: 'kind',
		get header() {
			return m.stock_col_movement();
		},
		cell: (info) => MOVEMENT_LABELS[info.getValue() as string]
	},
	{
		accessorKey: 'party',
		get header() {
			return m.stock_from_to();
		},
		cell: longText(NAME_LENGTH)
	},
	{
		accessorKey: 'location',
		get header() {
			return m.common_location();
		}
	},
	{
		accessorKey: 'lotNumber',
		get header() {
			return m.stock_col_lot();
		},
		cell: (info) => info.getValue() ?? '—'
	},
	{
		id: 'in',
		get header() {
			return m.stock_in();
		},
		cell: ({ row }) => (Number(row.original.quantity) > 0 ? qty(row.original.quantity) : '')
	},
	{
		id: 'out',
		get header() {
			return m.stock_out();
		},
		cell: ({ row }) =>
			Number(row.original.quantity) < 0 ? qty(-Number(row.original.quantity)) : ''
	},
	{
		accessorKey: 'balance',
		get header() {
			return m.stock_balance();
		},
		cell: (info) => qty(info.getValue() as number)
	},
	{
		accessorKey: 'unitCost',
		get header() {
			return m.stock_col_unit_cost();
		},
		cell: (info) => formatETB(Number(info.getValue()))
	}
];
