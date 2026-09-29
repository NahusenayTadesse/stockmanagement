import type { ColumnDef } from '@tanstack/table-core';
import { labels } from '$lib/format';
import { moneyCell } from '$lib/table';
import { m } from '$lib/paraglide/messages.js';
import type { PageData } from './$types';
import {
	column,
	derived,
	itemColumn,
	money,
	orDash,
	percent,
	quantity,
	skuColumn
} from '../columnKit';

type Row = PageData['report']['rows'][number];

export const CLASS_NAMES: Record<string, string> = labels({
	A: () => 'A',
	B: () => 'B',
	C: () => 'C',
	none: m.reports_class_none
});

export function columns(basis: 'cost' | 'revenue'): ColumnDef<Row>[] {
	const used = basis === 'cost';
	return [
		{ accessorKey: 'rank', header: '#', cell: (i) => i.getValue() ?? '—' },
		itemColumn(),
		skuColumn(),
		orDash('category', m.reports_col_category),
		derived('class', m.reports_col_class, (r) => CLASS_NAMES[r.cls]),
		quantity('quantity', used ? m.reports_col_used : m.reports_col_sold),
		column<Row>(
			'value',
			used ? m.reports_col_value_used : m.reports_col_sales_before_vat,
			moneyCell
		),
		percent('share', m.reports_col_share),
		percent('cumulative', m.reports_col_running_total),
		quantity('onHand', m.reports_col_on_hand),
		money('stockValue', m.reports_col_stock_value)
	];
}
