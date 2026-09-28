import type { ColumnDef } from '@tanstack/table-core';
import { formatETB } from '@nahu/admin-kit/global';
import { MOVEMENT_LABELS, qty } from '$lib/format';
import type { PageData } from './$types';

type Row = PageData['movements'][number];

export const movementColumns: ColumnDef<Row>[] = [
	{
		accessorKey: 'kind',
		header: 'Movement',
		cell: (info) => MOVEMENT_LABELS[info.getValue() as string]
	},
	{ accessorKey: 'item', header: 'Item' },
	{ accessorKey: 'location', header: 'Location' },
	{ accessorKey: 'lotNumber', header: 'Lot', cell: (info) => info.getValue() ?? '—' },
	{ accessorKey: 'expiryDate', header: 'Expiry', cell: (info) => info.getValue() ?? '—' },
	{
		accessorKey: 'quantity',
		header: 'Quantity',
		cell: ({ row }) => qty(row.original.quantity, row.original.unit)
	},
	{
		accessorKey: 'unitCost',
		header: 'Unit cost',
		cell: (info) => formatETB(Number(info.getValue()))
	},
	{
		id: 'value',
		header: 'Value',
		cell: ({ row }) =>
			formatETB(Math.abs(Number(row.original.quantity) * Number(row.original.unitCost)))
	}
];
