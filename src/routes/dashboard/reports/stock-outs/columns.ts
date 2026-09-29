import type { ColumnDef } from '@tanstack/table-core';
import { ethiopianDate } from '@nahu/admin-kit/tableCells';
import { m } from '$lib/paraglide/messages.js';
import type { PageData } from './$types';
import { column, date, derived, itemColumn, skuColumn } from '../columnKit';

type Summary = PageData['report']['items'][number];
type Period = PageData['report']['periods'][number];

export const summaryColumns: ColumnDef<Summary>[] = [
	itemColumn(),
	skuColumn(),
	column('location', m.common_location),
	derived('now', m.reports_col_now, (r) =>
		r.stillOut ? m.reports_out_of_stock() : m.reports_back_in_stock()
	),
	column('times', m.reports_col_times_out),
	column('days', m.reports_col_days_out),
	date('lastOut', m.reports_col_last_out)
];

export const periodColumns: ColumnDef<Period>[] = [
	itemColumn(),
	skuColumn(),
	column('location', m.common_location),
	date('outFrom', m.reports_col_ran_out),
	column('backIn', m.reports_back_in_stock, (i) =>
		i.getValue() ? ethiopianDate(i.getValue()) : m.reports_still_out()
	),
	column('days', m.reports_col_days_out)
];
