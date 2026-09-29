import type { ColumnDef } from '@tanstack/table-core';
import { qty } from '$lib/format';
import { m } from '$lib/paraglide/messages.js';
import type { PageData } from './$types';

type Row = NonNullable<PageData['trend']>['buckets'][number];

export function columns(unit: string): ColumnDef<Row>[] {
	return [
		{
			accessorKey: 'label',
			get header() {
				return m.reports_col_period();
			}
		},
		{
			accessorKey: 'in',
			get header() {
				return m.reports_in();
			},
			cell: (i) => qty(i.getValue() as number, unit)
		},
		{
			accessorKey: 'out',
			get header() {
				return m.reports_out();
			},
			cell: (i) => qty(i.getValue() as number, unit)
		},
		{
			accessorKey: 'low',
			get header() {
				return m.reports_col_lowest();
			},
			cell: (i) => qty(i.getValue() as number, unit)
		},
		{
			accessorKey: 'closing',
			get header() {
				return m.reports_col_at_end();
			},
			cell: (i) => qty(i.getValue() as number, unit)
		}
	];
}
