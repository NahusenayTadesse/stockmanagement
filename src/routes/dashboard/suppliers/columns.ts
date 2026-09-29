import type { ColumnDef } from '@tanstack/table-core';
import { renderComponent } from '@nahu/admin-kit/components/ui/data-table/index.js';
import DataTableLinks from '@nahu/admin-kit/components/Table/data-table-links.svelte';
import DataTableSort from '@nahu/admin-kit/components/Table/data-table-sort.svelte';
import Statuses from '@nahu/admin-kit/components/Table/statuses.svelte';
import { ethiopianDate } from '@nahu/admin-kit/tableCells';
import { formatETB } from '@nahu/admin-kit/global';
import { m } from '$lib/paraglide/messages.js';
import type { PageData } from './$types';

type Row = PageData['suppliers'][number];

const sortable = (name: string) =>
	(({ column }) =>
		renderComponent(DataTableSort, {
			name,
			onclick: column.getToggleSortingHandler()
		})) satisfies ColumnDef<Row>['header'];

/** The table's columns, named in the viewer's language: call it when the page renders. */
export const columns = (): ColumnDef<Row>[] => [
	{
		accessorKey: 'name',
		header: sortable(m.purchasing_col_supplier()),
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
	{ accessorKey: 'email', header: m.common_email(), cell: (info) => info.getValue() ?? '' },
	{ accessorKey: 'address', header: m.common_address(), cell: (info) => info.getValue() ?? '' },
	{ accessorKey: 'items', header: sortable(m.purchasing_col_items()) },
	{ accessorKey: 'deliveries', header: sortable(m.purchasing_col_deliveries()) },
	{
		accessorKey: 'lastDelivery',
		header: sortable(m.purchasing_col_last_delivery()),
		cell: (info) => (info.getValue() ? ethiopianDate(info.getValue()) : '—')
	},
	{
		accessorKey: 'received',
		header: sortable(m.purchasing_col_received_value()),
		cell: (info) => formatETB(Number(info.getValue()))
	},
	{
		accessorKey: 'paid',
		header: sortable(m.purchasing_col_paid()),
		cell: (info) => formatETB(Number(info.getValue()))
	},
	{
		accessorKey: 'owed',
		header: sortable(m.purchasing_col_owed()),
		cell: (info) => formatETB(Number(info.getValue()))
	},
	{
		accessorKey: 'status',
		header: m.common_status(),
		cell: ({ row }) =>
			renderComponent(Statuses, {
				status: row.original.status ? 'active' : 'inactive',
				label: row.original.status ? m.common_active() : m.common_inactive()
			})
	}
];
