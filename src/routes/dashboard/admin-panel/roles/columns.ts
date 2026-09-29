import type { ColumnDef } from '@tanstack/table-core';
import type { PageData } from './$types';
import { m } from '$lib/paraglide/messages.js';
import { longText, sortable } from '$lib/table';
import { activeCell, indexColumn, recordLink } from '$lib/table';

type Role = PageData['roleList'][number];

export const columns: ColumnDef<Role>[] = [
	indexColumn(),
	{
		accessorKey: 'name',
		header: sortable(m.common_name),
		cell: ({ row }) => recordLink('role', row.original.id, row.original.name)
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
		cell: ({ row }) => activeCell(row.original.status)
	},
	{
		accessorKey: 'permissionsCount',
		header: sortable(m.admin_users_permissions),
		cell: ({ row }) => (row.original.isOwner ? m.admin_roles_all() : row.original.permissionsCount)
	},
	{
		accessorKey: 'userCount',
		get header() {
			return m.admin_users_title();
		}
	}
];
