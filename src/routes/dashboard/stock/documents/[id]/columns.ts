import { m } from '$lib/paraglide/messages.js';
import type { ColumnDef } from '@tanstack/table-core';
import { formatETB } from '@nahu/admin-kit/global';
import { MOVEMENT_LABELS, qty } from '$lib/format';
import { renderComponent } from '@nahu/admin-kit/components/ui/data-table/index.js';
import DataTableLinks from '@nahu/admin-kit/components/Table/data-table-links.svelte';
import { documentStatusCell } from '$lib/table';
import type { PageData } from './$types';

type Row = PageData['movements'][number];

export const movementColumns: ColumnDef<Row>[] = [
	{
		accessorKey: 'kind',
		get header() {
			return m.stock_col_movement();
		},
		cell: (info) => MOVEMENT_LABELS[info.getValue() as string]
	},
	{
		accessorKey: 'item',
		get header() {
			return m.common_item();
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
		cell: (info) => info.getValue() ?? '—'
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
		accessorKey: 'unitCost',
		meta: { align: 'right' },
		get header() {
			return m.stock_col_unit_cost();
		},
		cell: (info) => formatETB(Number(info.getValue()))
	},
	{
		id: 'value',
		get header() {
			return m.stock_col_value();
		},
		cell: ({ row }) =>
			formatETB(Math.abs(Number(row.original.quantity) * Number(row.original.unitCost)))
	}
];

type Return = PageData['returnsMade'][number];

/** The returns already made against this document. */
export const returnColumns: ColumnDef<Return>[] = [
	{
		accessorKey: 'number',
		get header() {
			return m.stock_col_number();
		},
		cell: ({ row }) =>
			renderComponent(DataTableLinks, {
				id: row.original.id,
				name: row.original.number ?? m.stock_draft_return({ id: row.original.id }),
				entity: 'document'
			})
	},
	{
		accessorKey: 'status',
		get header() {
			return m.common_status();
		},
		cell: ({ row }) => documentStatusCell(row.original.status)
	}
];
