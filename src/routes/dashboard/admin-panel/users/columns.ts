import type { ColumnDef } from '@tanstack/table-core';
import { renderComponent } from '@nahu/admin-kit/components/ui/data-table/index.js';
import DataTableLinks from '@nahu/admin-kit/components/Table/data-table-links.svelte';
import DataTableSort from '@nahu/admin-kit/components/Table/data-table-sort.svelte';
import Statuses from '@nahu/admin-kit/components/Table/statuses.svelte';
import { ethiopianDate } from '@nahu/admin-kit/tableCells';
import type { PageData } from './$types';
import { m } from '$lib/paraglide/messages.js';

type Row = PageData['userList'][number];

/** A sortable header, named in the viewer's language when it is drawn. */
const sortable = (name: () => string) =>
	(({ column }) =>
		renderComponent(DataTableSort, {
			name: name(),
			onclick: column.getToggleSortingHandler()
		})) satisfies ColumnDef<Row>['header'];

export const columns: ColumnDef<Row>[] = [
	{ id: 'index', header: '#', cell: (info) => info.row.index + 1, enableSorting: false },
	{
		accessorKey: 'name',
		header: sortable(m.common_name),
		cell: ({ row }) =>
			renderComponent(DataTableLinks, {
				id: row.original.id,
				name: row.original.name,
				entity: 'user'
			})
	},
	{ accessorKey: 'email', header: sortable(m.common_email) },
	{
		accessorKey: 'role',
		header: sortable(m.admin_users_col_role),
		cell: ({ row }) =>
			renderComponent(DataTableLinks, {
				id: row.original.roleId,
				name: row.original.role ?? '—',
				entity: 'role'
			})
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
		cell: ({ row }) =>
			renderComponent(Statuses, {
				// The colour follows the English word; the badge says it in the viewer's language.
				status: row.original.status ? 'Active' : 'Inactive',
				label: row.original.status ? m.common_active() : m.common_inactive()
			})
	},
	{
		accessorKey: 'createdAt',
		header: sortable(m.admin_users_col_added),
		cell: (info) => ethiopianDate(info.getValue())
	}
];
