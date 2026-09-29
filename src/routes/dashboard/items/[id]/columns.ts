import { m } from '$lib/paraglide/messages.js';
import type { ColumnDef } from '@tanstack/table-core';
import { renderComponent } from '@nahu/admin-kit/components/ui/data-table/index.js';
import DataTableLinks from '@nahu/admin-kit/components/Table/data-table-links.svelte';
import ExpiryCell from '@nahu/admin-kit/components/Table/expiry-cell.svelte';
import { MOVEMENT_LABELS, qty } from '$lib/format';
import type { PageData } from './$types';
import { dateCell, longText, moneyCell, NAME_LENGTH, textColumn } from '$lib/table';

type StockRow = PageData['stock'][number];
type CardRow = PageData['card'][number];
type HeldRow = PageData['held'][number];

export const stockColumns: ColumnDef<StockRow>[] = [
	textColumn('branch', m.common_branch),
	textColumn('location', m.common_location),
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
		meta: { align: 'right' },
		get header() {
			return m.common_quantity();
		},
		cell: ({ row }) => qty(row.original.quantity, row.original.unit)
	},
	{
		accessorKey: 'value',
		meta: { align: 'right' },
		get header() {
			return m.stock_col_value();
		},
		cell: moneyCell
	}
];

export const cardColumns: ColumnDef<CardRow>[] = [
	{
		accessorKey: 'docDate',
		get header() {
			return m.common_date();
		},
		cell: dateCell
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
	textColumn('location', m.common_location),
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
		meta: { align: 'right' },
		get header() {
			return m.stock_balance();
		},
		cell: (info) => qty(info.getValue() as number)
	},
	{
		accessorKey: 'unitCost',
		meta: { align: 'right' },
		get header() {
			return m.stock_col_unit_cost();
		},
		cell: moneyCell
	}
];

/** Stock held for proformas and requisitions, in the item's base unit. */
export function heldColumns(unit: string): ColumnDef<HeldRow>[] {
	return [
		textColumn('for', m.common_reference),
		textColumn('location', m.common_location),
		{
			accessorKey: 'quantity',
			meta: { align: 'right' },
			get header() {
				return m.common_quantity();
			},
			cell: ({ row }) => qty(row.original.quantity, unit)
		}
	];
}
