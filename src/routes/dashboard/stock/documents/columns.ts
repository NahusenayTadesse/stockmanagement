import { m } from '$lib/paraglide/messages.js';
import type { ColumnDef } from '@tanstack/table-core';
import { renderComponent } from '@nahu/admin-kit/components/ui/data-table/index.js';
import DataTableLinks from '@nahu/admin-kit/components/Table/data-table-links.svelte';
import DataTableSort from '@nahu/admin-kit/components/Table/data-table-sort.svelte';
import Statuses from '@nahu/admin-kit/components/Table/statuses.svelte';
import { ethiopianDate } from '@nahu/admin-kit/tableCells';
import { signed } from '../../transactions/columns';
import { DOCUMENT_LABELS, DOCUMENT_STATUS_LABELS } from '$lib/format';
import type { PageData } from './$types';
import { longText, NAME_LENGTH } from '$lib/cells';

type Row = PageData['documents'][number];

/** A sortable header, named in the viewer's language when the table is drawn. */
const sortable = (name: () => string) =>
	(({ column }) =>
		renderComponent(DataTableSort, {
			name: name(),
			onclick: column.getToggleSortingHandler()
		})) satisfies ColumnDef<Row>['header'];

/** `statuses` colours confirmed/pending/cancelled; map the document's own words onto them. */
const STATUS_WORD = {
	posted: 'confirmed',
	draft: 'pending',
	in_transit: 'in transit',
	cancelled: 'cancelled'
} as const;

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
		cell: (info) => ethiopianDate(info.getValue())
	},
	{
		accessorKey: 'from',
		get header() {
			return m.stock_col_from();
		},
		cell: (info) => info.getValue() ?? ''
	},
	{
		accessorKey: 'to',
		get header() {
			return m.stock_col_to();
		},
		cell: (info) => info.getValue() ?? ''
	},
	{
		accessorKey: 'party',
		get header() {
			return m.stock_col_party();
		},
		cell: longText(NAME_LENGTH)
	},
	{
		accessorKey: 'reference',
		get header() {
			return m.common_reference();
		},
		cell: (info) => info.getValue() ?? ''
	},
	{
		accessorKey: 'lines',
		get header() {
			return m.stock_col_lines();
		}
	},
	{
		accessorKey: 'paymentAmount',
		get header() {
			return m.stock_col_payment();
		},
		cell: ({ row }) =>
			row.original.paymentId && row.original.paymentDirection
				? renderComponent(DataTableLinks, {
						id: row.original.paymentId,
						name:
							signed(row.original.paymentDirection, row.original.paymentAmount ?? 0) +
							(row.original.paymentStatus === 'void' ? m.stock_void_suffix() : ''),
						entity: 'transaction'
					})
				: ''
	},
	{
		accessorKey: 'status',
		header: sortable(m.common_status),
		cell: ({ row }) =>
			renderComponent(Statuses, {
				status: STATUS_WORD[row.original.status],
				label: DOCUMENT_STATUS_LABELS[row.original.status]
			})
	},
	{
		accessorKey: 'createdBy',
		get header() {
			return m.stock_col_by();
		},
		cell: (info) => info.getValue() ?? ''
	}
];
