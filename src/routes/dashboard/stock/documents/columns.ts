import { m } from '$lib/paraglide/messages.js';
import type { ColumnDef } from '@tanstack/table-core';
import { renderComponent } from '@nahu/admin-kit/components/ui/data-table/index.js';
import DataTableLinks from '@nahu/admin-kit/components/Table/data-table-links.svelte';
import { DOCUMENT_LABELS, signedAmount } from '$lib/format';
import type { PageData } from './$types';
import {
	dateCell,
	longText,
	NAME_LENGTH,
	sortable,
	documentStatusCell,
	textColumn
} from '$lib/table';

type Row = PageData['documents'][number];

export const columns: ColumnDef<Row>[] = [
	{
		accessorKey: 'number',
		header: sortable(m.stock_col_number),
		cell: ({ row }) =>
			renderComponent(DataTableLinks, {
				id: row.original.id,
				name: row.original.number ?? m.stock_draft_number({ id: row.original.id }),
				entity: 'document'
			})
	},
	{
		accessorKey: 'type',
		header: sortable(m.stock_col_type),
		cell: (info) => DOCUMENT_LABELS[info.getValue() as keyof typeof DOCUMENT_LABELS]
	},
	{
		accessorKey: 'docDate',
		header: sortable(m.common_date),
		cell: dateCell
	},
	textColumn('from', m.stock_col_from),
	textColumn('to', m.stock_col_to),
	{
		accessorKey: 'party',
		get header() {
			return m.stock_col_party();
		},
		cell: longText(NAME_LENGTH)
	},
	textColumn('reference', m.common_reference),
	{
		accessorKey: 'lines',
		get header() {
			return m.stock_col_lines();
		}
	},
	{
		accessorKey: 'paymentAmount',
		meta: { align: 'right' },
		get header() {
			return m.stock_col_payment();
		},
		cell: ({ row }) =>
			row.original.paymentId && row.original.paymentDirection
				? renderComponent(DataTableLinks, {
						id: row.original.paymentId,
						name:
							signedAmount(row.original.paymentDirection, row.original.paymentAmount ?? 0) +
							(row.original.paymentStatus === 'void' ? m.stock_void_suffix() : ''),
						entity: 'transaction'
					})
				: ''
	},
	{
		accessorKey: 'status',
		header: sortable(m.common_status),
		cell: ({ row }) => documentStatusCell(row.original.status)
	},
	textColumn('createdBy', m.stock_col_by)
];
