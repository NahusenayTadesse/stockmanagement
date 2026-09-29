import type { ColumnDef } from '@tanstack/table-core';
import { renderComponent } from '@nahu/admin-kit/components/ui/data-table/index.js';
import DataTableLinks from '@nahu/admin-kit/components/Table/data-table-links.svelte';
import DataTableSort from '@nahu/admin-kit/components/Table/data-table-sort.svelte';
import Statuses from '@nahu/admin-kit/components/Table/statuses.svelte';
import type { PageData } from './$types';
import { m } from '$lib/paraglide/messages.js';
import { longText } from '$lib/cells';

type Role = PageData['roleList'][number];

export const columns: ColumnDef<Role>[] = [
	{ id: 'index', header: '#', cell: (info) => info.row.index + 1, enableSorting: false },
	{
		accessorKey: 'name',
		header: ({ column }) =>
			renderComponent(DataTableSort, {
				name: m.common_name(),
				onclick: column.getToggleSortingHandler()
			}),
		cell: ({ row }) =>
			renderComponent(DataTableLinks, {
				id: row.original.id,
				name: row.original.name,
				entity: 'role'
			})
	},
	{
		accessorKey: 'description',
		get header() {
			return m.admin_roles_description();
		},
		cell: longText()
	},
	{
		accessorKey: 'status',
		get header() {
			return m.common_status();
		},
		cell: ({ row }) =>
			renderComponent(Statuses, {
				// The colour follows the English word; the badge says it in the viewer's language.
				status: row.original.status ? 'Active' : 'Inactive',
				label: row.original.status ? m.common_active() : m.common_inactive()
			})
	},
	{
		accessorKey: 'permissionsCount',
		header: ({ column }) =>
			renderComponent(DataTableSort, {
				name: m.admin_users_permissions(),
				onclick: column.getToggleSortingHandler()
			}),
		cell: ({ row }) => (row.original.isOwner ? m.admin_roles_all() : row.original.permissionsCount)
	},
	{
		accessorKey: 'userCount',
		get header() {
			return m.admin_users_title();
		}
	}
];
