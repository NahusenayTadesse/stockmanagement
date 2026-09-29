import type { ColumnDef } from '@tanstack/table-core';
import { renderComponent } from '@nahu/admin-kit/components/ui/data-table/index.js';
import Statuses from '@nahu/admin-kit/components/Table/statuses.svelte';
import { formatETB } from '@nahu/admin-kit/global';
import type { PageData } from './$types';
import SubjectLink from './SubjectLink.svelte';

type Row = PageData['history'][number];

const when = (v: unknown) =>
	v ? new Date(v as string).toLocaleString('en-GB', { timeZone: 'Africa/Addis_Ababa' }) : '';

export const columns: ColumnDef<Row>[] = [
	{
		accessorKey: 'subject',
		header: 'What',
		cell: ({ row }) =>
			renderComponent(SubjectLink, { href: row.original.link, label: row.original.subject })
	},
	{ accessorKey: 'reason', header: 'Why it needed approval' },
	{ accessorKey: 'value', header: 'Value', cell: (i) => formatETB(Number(i.getValue())) },
	{ accessorKey: 'requestedBy', header: 'Asked by', cell: (i) => i.getValue() ?? '' },
	{ accessorKey: 'requestedAt', header: 'Asked', cell: (i) => when(i.getValue()) },
	{
		accessorKey: 'status',
		header: 'Decision',
		cell: ({ row }) => renderComponent(Statuses, { status: row.original.status })
	},
	{ accessorKey: 'decidedBy', header: 'By', cell: (i) => i.getValue() ?? '' },
	{ accessorKey: 'decidedAt', header: 'When', cell: (i) => when(i.getValue()) },
	{ accessorKey: 'decisionNote', header: 'Note', cell: (i) => i.getValue() ?? '' }
];
