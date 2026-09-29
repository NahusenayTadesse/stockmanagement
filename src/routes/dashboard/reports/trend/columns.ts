import type { ColumnDef } from '@tanstack/table-core';
import { qty } from '$lib/format';
import type { PageData } from './$types';

type Row = NonNullable<PageData['trend']>['buckets'][number];

export function columns(unit: string): ColumnDef<Row>[] {
	return [
		{ accessorKey: 'label', header: 'Period' },
		{ accessorKey: 'in', header: 'In', cell: (i) => qty(i.getValue() as number, unit) },
		{ accessorKey: 'out', header: 'Out', cell: (i) => qty(i.getValue() as number, unit) },
		{ accessorKey: 'low', header: 'Lowest', cell: (i) => qty(i.getValue() as number, unit) },
		{ accessorKey: 'closing', header: 'At the end', cell: (i) => qty(i.getValue() as number, unit) }
	];
}
