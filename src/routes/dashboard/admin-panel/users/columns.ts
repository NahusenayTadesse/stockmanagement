import type { ColumnDef } from '@tanstack/table-core';
import type { PageData } from './$types';
import { m } from '$lib/paraglide/messages.js';
import { dateCell, sortable } from '$lib/table';
import { activeCell, indexColumn, recordLink } from '$lib/table';

type Row = PageData['userList'][number];

export const columns: ColumnDef<Row>[] = [
	indexColumn(),
	{
		accessorKey: 'name',
		header: sortable(m.common_name),
		cell: ({ row }) => recordLink('user', row.original.id, row.original.name)
	},
	{ accessorKey: 'email', header: sortable(m.common_email) },
	{
		accessorKey: 'role',
		header: sortable(m.admin_users_col_role),
		cell: ({ row }) => recordLink('role', row.original.roleId, row.original.role ?? '—')
	},
	{
		accessorKey: 'branch',
		get header() {
			return m.admin_users_col_home_branch();
		},
		cell: (info) => info.getValue() ?? '—'
	},
	{
		accessorKey: 'worksIn',
		get header() {
			return m.admin_users_col_works_in();
		}
	},
	{
		accessorKey: 'status',
		get header() {
			return m.common_status();
		},
		cell: ({ row }) => activeCell(row.original.status)
	},
	{ accessorKey: 'createdAt', header: sortable(m.admin_users_col_added), cell: dateCell }
];
