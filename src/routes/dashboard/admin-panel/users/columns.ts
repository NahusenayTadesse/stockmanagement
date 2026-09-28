import type { ColumnDef } from '@tanstack/table-core';
import { renderComponent } from '@nahu/admin-kit/components/ui/data-table/index.js';
import DataTableLinks from '@nahu/admin-kit/components/Table/data-table-links.svelte';
import DataTableSort from '@nahu/admin-kit/components/Table/data-table-sort.svelte';
import Statuses from '@nahu/admin-kit/components/Table/statuses.svelte';
import { ethiopianDate } from '@nahu/admin-kit/tableCells';
import type { PageData } from './$types';

type Row = PageData['userList'][number];

const sortable = (name: string) =>
	(({ column }) =>
		renderComponent(DataTableSort, {
			name,
			onclick: column.getToggleSortingHandler()
		})) satisfies ColumnDef<Row>['header'];

export const columns: ColumnDef<Row>[] = [
	{ id: 'index', header: '#', cell: (info) => info.row.index + 1, enableSorting: false },
	{
		accessorKey: 'name',
		header: sortable('Name'),
		cell: ({ row }) =>
			renderComponent(DataTableLinks, {
				id: row.original.id,
				name: row.original.name,
				entity: 'user'
			})
	},
	{ accessorKey: 'email', header: sortable('Email') },
	{
		accessorKey: 'role',
		header: sortable('Role'),
		cell: ({ row }) =>
			renderComponent(DataTableLinks, {
				id: row.original.roleId,
				name: row.original.role ?? '—',
				entity: 'role'
			})
	},
	{ accessorKey: 'branch', header: 'Branch', cell: (info) => info.getValue() ?? '—' },
	{
		accessorKey: 'status',
		header: 'Status',
		cell: ({ row }) =>
			renderComponent(Statuses, { status: row.original.status ? 'Active' : 'Inactive' })
	},
	{
		accessorKey: 'createdAt',
		header: sortable('Added'),
		cell: (info) => ethiopianDate(info.getValue())
	}
];
