import type { ColumnDef } from '@tanstack/table-core';
import { renderComponent } from '@nahu/admin-kit/components/ui/data-table/index.js';
import DataTableLinks from '@nahu/admin-kit/components/Table/data-table-links.svelte';
import DataTableSort from '@nahu/admin-kit/components/Table/data-table-sort.svelte';
import Statuses from '@nahu/admin-kit/components/Table/statuses.svelte';
import { ethiopianDate } from '@nahu/admin-kit/tableCells';
import { formatETB } from '@nahu/admin-kit/global';
import { PURPOSE_LABELS } from '$lib/schemas/transactions';
import { m } from '$lib/paraglide/messages.js';
import { getLocale } from '$lib/paraglide/runtime';
import type { PageData } from './$types';

type Row = PageData['rows'][number];

/** A sortable header, named in the viewer's language when it is drawn. */
const sortable = (name: () => string) =>
	(({ column }) =>
		renderComponent(DataTableSort, {
			name: name(),
			onclick: column.getToggleSortingHandler()
		})) satisfies ColumnDef<Row>['header'];

/** `statuses` colours confirmed/pending/cancelled; a transaction's own words map onto them. */
export const STATUS_WORD = {
	verified: 'confirmed',
	recorded: 'pending',
	void: 'cancelled'
} as const;

/**
 * A transaction's status in the viewer's language. In English it is the word `statuses` colours
 * (confirmed/pending/cancelled); other languages read their own word, in grey.
 */
export const statusText = (status: keyof typeof STATUS_WORD) =>
	getLocale() === 'en'
		? STATUS_WORD[status]
		: {
				verified: m.sales_tx_status_verified,
				recorded: m.sales_tx_status_recorded,
				void: m.sales_tx_status_void
			}[status]();

/** A plain text column, headed in the viewer's language. */
const text = (key: keyof Row & string, header: () => string): ColumnDef<Row> => ({
	accessorKey: key,
	get header() {
		return header();
	},
	cell: (info) => info.getValue() ?? ''
});

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
		header: sortable(m.common_date),
		cell: (info) => ethiopianDate(info.getValue())
	},
	{
		accessorKey: 'amount',
		header: sortable(m.sales_amount),
		// A voided row stays listed but must not read like money that moved.
		cell: ({ row }) =>
			signed(row.original.direction, row.original.amount) +
			(row.original.status === 'void' ? m.sales_void_suffix() : '')
	},
	{
		accessorKey: 'method',
		header: sortable(m.sales_method),
		cell: (info) => info.getValue() ?? '—'
	},
	{
		accessorKey: 'purpose',
		header: sortable(m.sales_for),
		cell: (info) => PURPOSE_LABELS[info.getValue() as string]
	},
	{
		accessorKey: 'party',
		header: sortable(m.sales_from_to),
		cell: (info) => info.getValue() ?? ''
	},
	text('reference', m.common_reference),
	text('receiptNumber', m.sales_receipt_no),
	text('documents', m.sales_documents),
	{
		accessorKey: 'attachments',
		get header() {
			return m.sales_files();
		},
		cell: (info) => (Number(info.getValue()) ? `📎 ${info.getValue()}` : '')
	},
	{
		accessorKey: 'status',
		header: sortable(m.common_status),
		cell: ({ row }) =>
			renderComponent(Statuses, {
				status: STATUS_WORD[row.original.status],
				label: statusText(row.original.status)
			})
	},
	text('branch', m.common_branch),
	text('recordedBy', m.sales_recorded_by)
];
