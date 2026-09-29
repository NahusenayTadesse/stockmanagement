import type { ColumnDef } from '@tanstack/table-core';
import { renderComponent } from '@nahu/admin-kit/components/ui/data-table/index.js';
import DataTableLinks from '@nahu/admin-kit/components/Table/data-table-links.svelte';
import { ethiopianDate } from '@nahu/admin-kit/tableCells';
import { m } from '$lib/paraglide/messages.js';
import type { PageData } from './$types';

type Summary = PageData['report']['items'][number];
type Period = PageData['report']['periods'][number];

const itemLink = (row: { itemId: number; item: string }) =>
	renderComponent(DataTableLinks, { id: row.itemId, name: row.item, entity: 'item' });

export const summaryColumns: ColumnDef<Summary>[] = [
	{
		accessorKey: 'item',
		get header() {
			return m.common_item();
		},
		cell: ({ row }) => itemLink(row.original)
	},
	{
		accessorKey: 'sku',
		get header() {
			return m.reports_col_code();
		}
	},
	{
		accessorKey: 'location',
		get header() {
			return m.common_location();
		}
	},
	{
		id: 'now',
		get header() {
			return m.reports_col_now();
		},
		accessorFn: (r) => (r.stillOut ? m.reports_out_of_stock() : m.reports_back_in_stock())
	},
	{
		accessorKey: 'times',
		get header() {
			return m.reports_col_times_out();
		}
	},
	{
		accessorKey: 'days',
		get header() {
			return m.reports_col_days_out();
		}
	},
	{
		accessorKey: 'lastOut',
		get header() {
			return m.reports_col_last_out();
		},
		cell: (i) => ethiopianDate(i.getValue())
	}
];

export const periodColumns: ColumnDef<Period>[] = [
	{
		accessorKey: 'item',
		get header() {
			return m.common_item();
		},
		cell: ({ row }) => itemLink(row.original)
	},
	{
		accessorKey: 'sku',
		get header() {
			return m.reports_col_code();
		}
	},
	{
		accessorKey: 'location',
		get header() {
			return m.common_location();
		}
	},
	{
		accessorKey: 'outFrom',
		get header() {
			return m.reports_col_ran_out();
		},
		cell: (i) => ethiopianDate(i.getValue())
	},
	{
		accessorKey: 'backIn',
		get header() {
			return m.reports_back_in_stock();
		},
		cell: (i) => (i.getValue() ? ethiopianDate(i.getValue()) : m.reports_still_out())
	},
	{
		accessorKey: 'days',
		get header() {
			return m.reports_col_days_out();
		}
	}
];
