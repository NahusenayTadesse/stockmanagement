import type { ColumnDef } from '@tanstack/table-core';
import { renderComponent } from '@nahu/admin-kit/components/ui/data-table/index.js';
import { m } from '$lib/paraglide/messages.js';
import type { PageData } from './$types';
import SubjectLink from './SubjectLink.svelte';
import { dateTimeCell, longText, moneyCell, statusCell, textColumn } from '$lib/table';

type Row = PageData['history'][number];

/** The table's columns, named in the viewer's language: call it when the page renders. */
export const columns = (): ColumnDef<Row>[] => [
	{
		accessorKey: 'subject',
		header: m.purchasing_col_what(),
		cell: ({ row }) =>
			renderComponent(SubjectLink, { href: row.original.link, label: row.original.subject })
	},
	{ accessorKey: 'reason', header: m.purchasing_col_why(), cell: longText() },
	{
		accessorKey: 'value',
		header: m.purchasing_col_value(),
		cell: moneyCell,
		meta: { align: 'right' }
	},
	textColumn<Row>('requestedBy', m.purchasing_col_asked_by),
	{ accessorKey: 'requestedAt', header: m.purchasing_col_asked_on(), cell: dateTimeCell },
	{
		accessorKey: 'status',
		header: m.purchasing_col_decision(),
		cell: ({ row }) =>
			statusCell(
				row.original.status,
				{
					pending: m.purchasing_appr_state_pending,
					approved: m.purchasing_appr_state_approved,
					rejected: m.purchasing_appr_state_rejected,
					withdrawn: m.purchasing_appr_state_withdrawn
				}[row.original.status]()
			)
	},
	textColumn<Row>('decidedBy', m.purchasing_col_by),
	{ accessorKey: 'decidedAt', header: m.purchasing_col_when(), cell: dateTimeCell },
	{ accessorKey: 'decisionNote', header: m.common_note(), cell: longText() }
];
