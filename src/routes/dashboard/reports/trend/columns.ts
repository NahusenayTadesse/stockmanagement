import type { ColumnDef } from '@tanstack/table-core';
import { qty } from '$lib/format';
import { m } from '$lib/paraglide/messages.js';
import type { PageData } from './$types';
import { column } from '../columnKit';

type Row = NonNullable<PageData['trend']>['buckets'][number];

export function columns(unit: string): ColumnDef<Row>[] {
	const inUnit = (key: 'in' | 'out' | 'low' | 'closing', label: () => string) =>
		column<Row>(key, label, (i) => qty(i.getValue() as number, unit));
	return [
		column('label', m.reports_col_period),
		inUnit('in', m.reports_in),
		inUnit('out', m.reports_out),
		inUnit('low', m.reports_col_lowest),
		inUnit('closing', m.reports_col_at_end)
	];
}
