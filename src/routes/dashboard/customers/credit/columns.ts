import type { ColumnDef } from '@tanstack/table-core';
import { formatETB } from '@nahu/admin-kit/global';
import { m } from '$lib/paraglide/messages.js';
import type { PageData } from './$types';
import { column, recordLink, RIGHT, textColumn } from '$lib/table';

type Row = PageData['rows'][number];
const etb = (v: unknown) => (Number(v) ? formatETB(Number(v)) : '—');

/** An ageing bucket: the shared amount column, with a dash where nothing is owed. */
const money = (key: keyof Row & string, header: () => string) =>
	column<Row>(key, header, (i) => etb(i.getValue()), RIGHT);

export const columns: ColumnDef<Row>[] = [
	{
		accessorKey: 'name',
		get header() {
			return m.sales_customer();
		},
		cell: ({ row }) => recordLink('customer', row.original.id, row.original.name)
	},
	textColumn<Row>('phone', m.common_phone),
	{
		accessorKey: 'balance',
		get header() {
			return m.sales_owes();
		},
		cell: ({ row }) =>
			row.original.balance < 0
				? m.sales_in_credit({ amount: formatETB(-row.original.balance) })
				: formatETB(row.original.balance)
	},
	money('current', m.sales_bucket_current),
	money('d1_30', m.sales_col_1_30),
	money('d31_60', m.sales_col_31_60),
	money('d61_90', m.sales_col_61_90),
	money('d90_plus', m.sales_col_over_90),
	{
		accessorKey: 'oldestOverdueDays',
		get header() {
			return m.sales_longest_overdue();
		},
		cell: (i) =>
			Number(i.getValue()) > 0 ? m.sales_days_count({ count: Number(i.getValue()) }) : '—'
	},
	{
		accessorKey: 'creditLimit',
		get header() {
			return m.sales_limit();
		},
		cell: ({ row }) =>
			row.original.creditLimit === null
				? m.sales_no_limit()
				: row.original.creditLimit === 0
					? m.sales_cash_only()
					: formatETB(row.original.creditLimit) +
						(row.original.overLimit ? m.sales_over_flag() : '')
	}
];
