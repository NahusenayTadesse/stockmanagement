import type { ColumnDef } from '@tanstack/table-core';
import { renderComponent } from '@nahu/admin-kit/components/ui/data-table/index.js';
import DataTableLinks from '@nahu/admin-kit/components/Table/data-table-links.svelte';
import { m } from '$lib/paraglide/messages.js';
import type { PageData } from './$types';
import { dateCell, longText, moneyCell, sortable, statusCell, textColumn } from '$lib/table';

type Row = PageData['suppliers'][number];

/** The table's columns, named in the viewer's language: call it when the page renders. */
export const columns = (): ColumnDef<Row>[] => [
	{
		accessorKey: 'name',
		header: sortable<Row>(m.purchasing_col_supplier),
		cell: ({ row }) =>
			renderComponent(DataTableLinks, {
				id: row.original.id,
				name: row.original.name,
				entity: 'supplier'
			})
	},
	{
		accessorKey: 'phone',
		header: m.common_phone(),
		// Carried over from before suppliers were tracked, with no phone yet.
		cell: ({ row }) => row.original.phone || m.purchasing_phone_missing()
	},
	textColumn<Row>('email', m.common_email),
	{ accessorKey: 'address', header: m.common_address(), cell: longText() },
	{ accessorKey: 'items', header: sortable<Row>(m.purchasing_col_items) },
	{ accessorKey: 'deliveries', header: sortable<Row>(m.purchasing_col_deliveries) },
	{
		accessorKey: 'lastDelivery',
		header: sortable<Row>(m.purchasing_col_last_delivery),
		cell: (info) => (info.getValue() ? dateCell(info) : '—')
	},
	{
		accessorKey: 'received',
		meta: { align: 'right' },
		header: sortable<Row>(m.purchasing_col_received_value),
		cell: moneyCell
	},
	{
		accessorKey: 'paid',
		meta: { align: 'right' },
		header: sortable<Row>(m.purchasing_col_paid),
		cell: moneyCell
	},
	{
		accessorKey: 'owed',
		meta: { align: 'right' },
		header: sortable<Row>(m.purchasing_col_owed),
		cell: moneyCell
	},
	{
		accessorKey: 'status',
		header: m.common_status(),
		cell: ({ row }) =>
			statusCell(
				row.original.status ? 'active' : 'inactive',
				row.original.status ? m.common_active() : m.common_inactive()
			)
	}
];
