import type { ColumnDef } from '@tanstack/table-core';
import { ethiopianDate } from '@nahu/admin-kit/tableCells';
import { labels } from '$lib/format';
import { m } from '$lib/paraglide/messages.js';
import type { PageData } from './$types';
import { column, derived, itemColumn, money, orDash, quantity, skuColumn } from '../columnKit';

type Row = PageData['report']['rows'][number];

export const STATUS_NAMES: Record<string, string> = labels({
	dead: m.reports_status_dead,
	slow: m.reports_status_slow
});

export const columns: ColumnDef<Row>[] = [
	itemColumn(),
	skuColumn(),
	orDash('category', m.reports_col_category),
	derived('statusName', m.common_status, (r) => STATUS_NAMES[r.status]),
	column(
		'idleDays',
		m.reports_col_days_idle,
		({ row }) =>
			`${row.original.idleDays}${row.original.neverIssued ? ` ${m.reports_never_issued()}` : ''}`
	),
	column('lastIssue', m.reports_col_last_issue, ({ row }) =>
		row.original.lastIssue ? ethiopianDate(row.original.lastIssue) : m.reports_never()
	),
	column('lastReceipt', m.reports_col_last_receipt, ({ row }) =>
		row.original.lastReceipt ? ethiopianDate(row.original.lastReceipt) : '—'
	),
	quantity('onHand', m.reports_col_on_hand),
	money('value', m.reports_col_value_at_cost)
];
