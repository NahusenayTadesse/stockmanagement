import type { ColumnDef } from '@tanstack/table-core';
import { renderComponent } from '@nahu/admin-kit/components/ui/data-table/index.js';
import DataTableLinks from '@nahu/admin-kit/components/Table/data-table-links.svelte';
import { signedAmount } from '$lib/format';
import { PURPOSE_LABELS } from '$lib/schemas/transactions';
import { m } from '$lib/paraglide/messages.js';
import { getLocale } from '$lib/paraglide/runtime';
import type { PageData } from './$types';
import { dateCell, longText, NAME_LENGTH, sortable, statusCell, textColumn } from '$lib/table';

type Row = PageData['rows'][number];

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

const text = (key: keyof Row & string, label: () => string) => textColumn<Row>(key, label);

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
		cell: dateCell
	},
	{
		accessorKey: 'amount',
		meta: { align: 'right' },
		header: sortable(m.sales_amount),
		// A voided row stays listed but must not read like money that moved.
		cell: ({ row }) =>
			signedAmount(row.original.direction, row.original.amount) +
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
		cell: longText(NAME_LENGTH)
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
		cell: ({ row }) => statusCell(STATUS_WORD[row.original.status], statusText(row.original.status))
	},
	text('branch', m.common_branch),
	text('recordedBy', m.sales_recorded_by)
];
