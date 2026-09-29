import type { ColumnDef } from '@tanstack/table-core';
import { renderComponent } from '@nahu/admin-kit/components/ui/data-table/index.js';
import Statuses from '@nahu/admin-kit/components/Table/statuses.svelte';
import { formatETB } from '@nahu/admin-kit/global';
import { m } from '$lib/paraglide/messages.js';
import type { PageData } from './$types';
import SubjectLink from './SubjectLink.svelte';

type Row = PageData['history'][number];

const when = (v: unknown) =>
	v ? new Date(v as string).toLocaleString('en-GB', { timeZone: 'Africa/Addis_Ababa' }) : '';

/** The table's columns, named in the viewer's language: call it when the page renders. */
export const columns = (): ColumnDef<Row>[] => [
	{
		accessorKey: 'subject',
		header: m.purchasing_col_what(),
		cell: ({ row }) =>
			renderComponent(SubjectLink, { href: row.original.link, label: row.original.subject })
	},
	{ accessorKey: 'reason', header: m.purchasing_col_why() },
	{
		accessorKey: 'value',
		header: m.purchasing_col_value(),
		cell: (i) => formatETB(Number(i.getValue()))
	},
	{
		accessorKey: 'requestedBy',
		header: m.purchasing_col_asked_by(),
		cell: (i) => i.getValue() ?? ''
	},
	{
		accessorKey: 'requestedAt',
		header: m.purchasing_col_asked_on(),
		cell: (i) => when(i.getValue())
	},
	{
		accessorKey: 'status',
		header: m.purchasing_col_decision(),
		cell: ({ row }) =>
			renderComponent(Statuses, {
				status: row.original.status,
				label: {
					pending: m.purchasing_appr_state_pending,
					approved: m.purchasing_appr_state_approved,
					rejected: m.purchasing_appr_state_rejected,
					withdrawn: m.purchasing_appr_state_withdrawn
				}[row.original.status]()
			})
	},
	{ accessorKey: 'decidedBy', header: m.purchasing_col_by(), cell: (i) => i.getValue() ?? '' },
	{ accessorKey: 'decidedAt', header: m.purchasing_col_when(), cell: (i) => when(i.getValue()) },
	{ accessorKey: 'decisionNote', header: m.common_note(), cell: (i) => i.getValue() ?? '' }
];
