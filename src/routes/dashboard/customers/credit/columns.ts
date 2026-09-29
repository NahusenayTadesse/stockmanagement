import type { ColumnDef } from '@tanstack/table-core';
import { renderComponent } from '@nahu/admin-kit/components/ui/data-table/index.js';
import DataTableLinks from '@nahu/admin-kit/components/Table/data-table-links.svelte';
import { formatETB } from '@nahu/admin-kit/global';
import type { PageData } from './$types';

type Row = PageData['rows'][number];
const etb = (v: unknown) => (Number(v) ? formatETB(Number(v)) : '—');

export const columns: ColumnDef<Row>[] = [
	{
		accessorKey: 'name',
		header: 'Customer',
		cell: ({ row }) =>
			renderComponent(DataTableLinks, {
				id: row.original.id,
				name: row.original.name,
				entity: 'customer'
			})
	},
	{ accessorKey: 'phone', header: 'Phone', cell: (i) => i.getValue() ?? '' },
	{
		accessorKey: 'balance',
		header: 'Owes',
		cell: ({ row }) =>
			row.original.balance < 0
				? `${formatETB(-row.original.balance)} in credit`
				: formatETB(row.original.balance)
	},
	{ accessorKey: 'current', header: 'Not yet due', cell: (i) => etb(i.getValue()) },
	{ accessorKey: 'd1_30', header: '1–30 days', cell: (i) => etb(i.getValue()) },
	{ accessorKey: 'd31_60', header: '31–60', cell: (i) => etb(i.getValue()) },
	{ accessorKey: 'd61_90', header: '61–90', cell: (i) => etb(i.getValue()) },
	{ accessorKey: 'd90_plus', header: 'Over 90', cell: (i) => etb(i.getValue()) },
	{
		accessorKey: 'oldestOverdueDays',
		header: 'Longest overdue',
		cell: (i) => (Number(i.getValue()) > 0 ? `${i.getValue()} days` : '—')
	},
	{
		accessorKey: 'creditLimit',
		header: 'Limit',
		cell: ({ row }) =>
			row.original.creditLimit === null
				? 'No limit'
				: row.original.creditLimit === 0
					? 'Cash only'
					: formatETB(row.original.creditLimit) + (row.original.overLimit ? ' ⚠ over' : '')
	}
];
