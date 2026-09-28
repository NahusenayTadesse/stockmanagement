import type { ColumnDef } from '@tanstack/table-core';
import { renderComponent } from '@nahu/admin-kit/components/ui/data-table/index.js';
import DataTableLinks from '@nahu/admin-kit/components/Table/data-table-links.svelte';
import DataTableSort from '@nahu/admin-kit/components/Table/data-table-sort.svelte';
import Statuses from '@nahu/admin-kit/components/Table/statuses.svelte';
import { ethiopianDate } from '@nahu/admin-kit/tableCells';
import { signed } from '../../transactions/columns';
import { DOCUMENT_LABELS } from '$lib/format';
import type { PageData } from './$types';

type Row = PageData['documents'][number];

const sortable = (name: string) =>
	(({ column }) =>
		renderComponent(DataTableSort, {
			name,
			onclick: column.getToggleSortingHandler()
		})) satisfies ColumnDef<Row>['header'];

/** `statuses` colours confirmed/pending/cancelled; map the document's own words onto them. */
const STATUS_WORD = { posted: 'confirmed', draft: 'pending', cancelled: 'cancelled' } as const;

export const columns: ColumnDef<Row>[] = [
	{
		accessorKey: 'number',
		header: sortable('Number'),
		cell: ({ row }) =>
			renderComponent(DataTableLinks, {
				id: row.original.id,
				name: row.original.number ?? `Draft #${row.original.id}`,
				entity: 'document'
			})
	},
	{
		accessorKey: 'type',
		header: sortable('Type'),
		cell: (info) => DOCUMENT_LABELS[info.getValue() as keyof typeof DOCUMENT_LABELS]
	},
	{
		accessorKey: 'docDate',
		header: sortable('Date'),
		cell: (info) => ethiopianDate(info.getValue())
	},
	{ accessorKey: 'from', header: 'From', cell: (info) => info.getValue() ?? '' },
	{ accessorKey: 'to', header: 'To', cell: (info) => info.getValue() ?? '' },
	{ accessorKey: 'party', header: 'Supplier / issued to', cell: (info) => info.getValue() ?? '' },
	{ accessorKey: 'reference', header: 'Reference', cell: (info) => info.getValue() ?? '' },
	{ accessorKey: 'lines', header: 'Lines' },
	{
		accessorKey: 'paymentAmount',
		header: 'Payment',
		cell: ({ row }) =>
			row.original.paymentId && row.original.paymentDirection
				? renderComponent(DataTableLinks, {
						id: row.original.paymentId,
						name:
							signed(row.original.paymentDirection, row.original.paymentAmount ?? 0) +
							(row.original.paymentStatus === 'void' ? ' (void)' : ''),
						entity: 'transaction'
					})
				: ''
	},
	{
		accessorKey: 'status',
		header: sortable('Status'),
		cell: ({ row }) => renderComponent(Statuses, { status: STATUS_WORD[row.original.status] })
	},
	{ accessorKey: 'createdBy', header: 'By', cell: (info) => info.getValue() ?? '' }
];
