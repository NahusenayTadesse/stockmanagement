import { m } from '$lib/paraglide/messages.js';
import type { ColumnDef } from '@tanstack/table-core';
import { renderComponent } from '@nahu/admin-kit/components/ui/data-table/index.js';
import ExpiryCell from '@nahu/admin-kit/components/Table/expiry-cell.svelte';
import DataTableLinks from '@nahu/admin-kit/components/Table/data-table-links.svelte';
import type { LookupRow } from '@nahu/admin-kit/components/lookup/types';
import { formatETB } from '@nahu/admin-kit/global';
import { qty } from '$lib/format';

/** The columns the lookup descriptor cannot express: a linked item, the expiry badge, amounts. */
export const extraColumns: ColumnDef<LookupRow>[] = [
	{
		accessorKey: 'item',
		get header() {
			return m.common_item();
		},
		cell: ({ row }) =>
			renderComponent(DataTableLinks, {
				id: row.original.itemId as number,
				name: row.original.item as string,
				entity: 'item'
			})
	},
	{
		accessorKey: 'expiryDate',
		get header() {
			return m.stock_col_expiry();
		},
		cell: ({ row }) =>
			renderComponent(ExpiryCell, {
				expiresOn: row.original.expiryDate as string | null,
				warningDays: row.original.warningDays as number
			})
	},
	{
		accessorKey: 'onHand',
		get header() {
			return m.stock_on_hand();
		},
		cell: ({ row }) => qty(row.original.onHand as number, row.original.unit as string)
	},
	{
		accessorKey: 'value',
		get header() {
			return m.stock_col_value();
		},
		cell: (info) => formatETB(Number(info.getValue()))
	}
];
