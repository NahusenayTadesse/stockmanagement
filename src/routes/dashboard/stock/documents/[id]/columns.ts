import { m } from '$lib/paraglide/messages.js';
import type { ColumnDef } from '@tanstack/table-core';
import { formatETB } from '@nahu/admin-kit/global';
import { MOVEMENT_LABELS, qty } from '$lib/format';
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
		get header() {
			return m.common_quantity();
		},
		cell: ({ row }) => qty(row.original.quantity, row.original.unit)
	},
	{
		accessorKey: 'unitCost',
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
