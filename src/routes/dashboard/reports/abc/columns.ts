import type { ColumnDef } from '@tanstack/table-core';
import { renderComponent } from '@nahu/admin-kit/components/ui/data-table/index.js';
import DataTableLinks from '@nahu/admin-kit/components/Table/data-table-links.svelte';
import { formatETB } from '@nahu/admin-kit/global';
import { labels, qty } from '$lib/format';
import { m } from '$lib/paraglide/messages.js';
import type { PageData } from './$types';

type Row = PageData['report']['rows'][number];

export const CLASS_NAMES: Record<string, string> = labels({
	A: () => 'A',
	B: () => 'B',
	C: () => 'C',
	none: m.reports_class_none
});

export function columns(basis: 'cost' | 'revenue'): ColumnDef<Row>[] {
	return [
		{ accessorKey: 'rank', header: '#', cell: (i) => i.getValue() ?? '—' },
		{
			accessorKey: 'item',
			get header() {
				return m.common_item();
			},
			cell: ({ row }) =>
				renderComponent(DataTableLinks, {
					id: row.original.itemId,
					name: row.original.item,
					entity: 'item'
				})
		},
		{
			accessorKey: 'sku',
			get header() {
				return m.reports_col_code();
			}
		},
		{
			accessorKey: 'category',
			get header() {
				return m.reports_col_category();
			},
			cell: (i) => i.getValue() ?? '—'
		},
		{
			id: 'class',
			get header() {
				return m.reports_col_class();
			},
			accessorFn: (r) => CLASS_NAMES[r.cls]
		},
		{
			accessorKey: 'quantity',
			header: basis === 'cost' ? m.reports_col_used() : m.reports_col_sold(),
			cell: ({ row }) => qty(row.original.quantity, row.original.unit)
		},
		{
			accessorKey: 'value',
			header: basis === 'cost' ? m.reports_col_value_used() : m.reports_col_sales_before_vat(),
			cell: (i) => formatETB(Number(i.getValue()))
		},
		{
			accessorKey: 'share',
			get header() {
				return m.reports_col_share();
			},
			cell: (i) => `${i.getValue()}%`
		},
		{
			accessorKey: 'cumulative',
			get header() {
				return m.reports_col_running_total();
			},
			cell: (i) => (i.getValue() === null ? '—' : `${i.getValue()}%`)
		},
		{
			accessorKey: 'onHand',
			get header() {
				return m.reports_col_on_hand();
			},
			cell: ({ row }) => qty(row.original.onHand, row.original.unit)
		},
		{
			accessorKey: 'stockValue',
			get header() {
				return m.reports_col_stock_value();
			},
			cell: (i) => formatETB(Number(i.getValue()))
		}
	];
}
