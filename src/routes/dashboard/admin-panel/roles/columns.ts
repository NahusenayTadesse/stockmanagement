import type { ColumnDef } from '@tanstack/table-core';
import { renderComponent } from '@nahu/admin-kit/components/ui/data-table/index.js';
import DataTableLinks from '@nahu/admin-kit/components/Table/data-table-links.svelte';
import DataTableSort from '@nahu/admin-kit/components/Table/data-table-sort.svelte';
import Statuses from '@nahu/admin-kit/components/Table/statuses.svelte';
import type { PageData } from './$types';

type Role = PageData['roleList'][number];

export const columns: ColumnDef<Role>[] = [
	{ id: 'index', header: '#', cell: (info) => info.row.index + 1, enableSorting: false },
	{
		accessorKey: 'name',
		header: ({ column }) =>
			renderComponent(DataTableSort, { name: 'Name', onclick: column.getToggleSortingHandler() }),
		cell: ({ row }) =>
			renderComponent(DataTableLinks, {
				id: row.original.id,
				name: row.original.name,
				entity: 'role'
			})
	},
	{ accessorKey: 'description', header: 'Description' },
	{
		accessorKey: 'status',
		header: 'Status',
		cell: ({ row }) =>
			renderComponent(Statuses, { status: row.original.status ? 'Active' : 'Inactive' })
	},
	{
		accessorKey: 'permissionsCount',
		header: ({ column }) =>
			renderComponent(DataTableSort, {
				name: 'Permissions',
				onclick: column.getToggleSortingHandler()
			}),
		cell: ({ row }) => (row.original.isOwner ? 'All' : row.original.permissionsCount)
	},
	{ accessorKey: 'userCount', header: 'Users' }
];
