import type { ColumnDef } from '@tanstack/table-core';
import { renderComponent } from '@nahu/admin-kit/components/ui/data-table/index.js';
import DataTableLinks from '@nahu/admin-kit/components/Table/data-table-links.svelte';
import DataTableSort from '@nahu/admin-kit/components/Table/data-table-sort.svelte';
import Statuses from '@nahu/admin-kit/components/Table/statuses.svelte';
import { ethiopianDate } from '@nahu/admin-kit/tableCells';
import { formatETB } from '@nahu/admin-kit/global';
import { PURPOSE_LABELS } from '$lib/schemas/transactions';
import type { PageData } from './$types';

type Row = PageData['rows'][number];

const sortable = (name: string) =>
	(({ column }) =>
		renderComponent(DataTableSort, {
			name,
			onclick: column.getToggleSortingHandler()
		})) satisfies ColumnDef<Row>['header'];

/** `statuses` colours confirmed/pending/cancelled; a transaction's own words map onto them. */
export const STATUS_WORD = {
	verified: 'confirmed',
	recorded: 'pending',
	void: 'cancelled'
} as const;

/** "+ ETB 1,200.00" in, "− ETB 1,200.00" out. */
export const signed = (direction: 'in' | 'out', amount: number) =>
	`${direction === 'in' ? '+' : '−'} ${formatETB(amount)}`;

export const columns: ColumnDef<Row>[] = [
	{
		accessorKey: 'id',
		header: '#',
		cell: ({ row }) =>
			renderComponent(DataTableLinks, {
				id: row.original.id,
				name: `#${row.original.id}`,
				entity: 'transaction'
			})
	},
	{
		accessorKey: 'occurredOn',
		header: sortable('Date'),
		cell: (info) => ethiopianDate(info.getValue())
	},
	{
		accessorKey: 'amount',
		header: sortable('Amount'),
		// A voided row stays listed but must not read like money that moved.
		cell: ({ row }) =>
			signed(row.original.direction, row.original.amount) +
			(row.original.status === 'void' ? ' (void)' : '')
	},
	{ accessorKey: 'method', header: sortable('Method'), cell: (info) => info.getValue() ?? '—' },
	{
		accessorKey: 'purpose',
		header: sortable('For'),
		cell: (info) => PURPOSE_LABELS[info.getValue() as string]
	},
	{ accessorKey: 'party', header: sortable('From / to'), cell: (info) => info.getValue() ?? '' },
	{ accessorKey: 'reference', header: 'Reference', cell: (info) => info.getValue() ?? '' },
	{ accessorKey: 'receiptNumber', header: 'Receipt no.', cell: (info) => info.getValue() ?? '' },
	{ accessorKey: 'documents', header: 'Documents', cell: (info) => info.getValue() ?? '' },
	{
		accessorKey: 'attachments',
		header: 'Files',
		cell: (info) => (Number(info.getValue()) ? `📎 ${info.getValue()}` : '')
	},
	{
		accessorKey: 'status',
		header: sortable('Status'),
		cell: ({ row }) => renderComponent(Statuses, { status: STATUS_WORD[row.original.status] })
	},
	{ accessorKey: 'branch', header: 'Branch', cell: (info) => info.getValue() ?? '' },
	{ accessorKey: 'recordedBy', header: 'Recorded by', cell: (info) => info.getValue() ?? '' }
];
