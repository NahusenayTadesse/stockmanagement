import type { ColumnDef } from '@tanstack/table-core';
import type { PageData } from './$types';

type Row = PageData['log'][number];

const when = (v: unknown) =>
	v ? new Date(v as string).toLocaleString('en-GB', { timeZone: 'Africa/Addis_Ababa' }) : '';

export const STATUS_TEXT: Record<Row['status'], string> = {
	sent: 'Sent',
	dry_run: 'Test mode (not sent)',
	failed: 'Failed',
	skipped: 'Not sent'
};

export const columns: ColumnDef<Row>[] = [
	{ accessorKey: 'createdAt', header: 'When', cell: (i) => when(i.getValue()) },
	{ accessorKey: 'phone', header: 'To' },
	{
		id: 'who',
		header: 'Customer / supplier',
		accessorFn: (r) => r.customer ?? r.supplier ?? ''
	},
	{ accessorKey: 'kind', header: 'For' },
	{
		accessorKey: 'status',
		header: 'Status',
		cell: ({ row }) =>
			STATUS_TEXT[row.original.status] + (row.original.error ? `: ${row.original.error}` : '')
	},
	{ accessorKey: 'body', header: 'Message' },
	{ accessorKey: 'units', header: 'Units', cell: (i) => i.getValue() ?? '' }
];
