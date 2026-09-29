import { m } from '$lib/paraglide/messages.js';
import type { ColumnDef } from '@tanstack/table-core';
import DataTableLinks from '@nahu/admin-kit/components/Table/data-table-links.svelte';
import { renderComponent } from '@nahu/admin-kit/components/ui/data-table/index.js';
import { formatEthiopianDate } from '@nahu/admin-kit/global';
import { dateCell, textColumn } from '$lib/table';
import type { PageData } from './$types';

type Road = PageData['onTheRoad'][number];
type Short = PageData['short'][number];

const transfer = <Row extends { id: number; number: string | null }>(): ColumnDef<Row> => ({
	accessorKey: 'number',
	get header() {
		return m.stock_col_transfer();
	},
	cell: ({ row }) =>
		renderComponent(DataTableLinks, {
			id: row.original.id,
			name: row.original.number ?? `#${row.original.id}`,
			entity: 'document'
		})
});

const sent = <Row>(): ColumnDef<Row> => ({
	accessorKey: 'docDate',
	get header() {
		return m.stock_sent();
	},
	cell: dateCell
});

/** Transfers sent and not yet received. */
export const roadColumns: ColumnDef<Road>[] = [
	transfer<Road>(),
	textColumn('from', m.stock_col_from),
	textColumn('to', m.stock_col_to),
	sent<Road>(),
	{
		accessorKey: 'days',
		get header() {
			return m.stock_days_on_road();
		},
		cell: (info) => {
			const d = Number(info.getValue());
			return d === 0 ? m.stock_today() : d === 1 ? m.stock_one_day() : m.stock_n_days({ days: d });
		}
	},
	textColumn('driverName', m.stock_driver),
	textColumn('vehiclePlate', m.stock_col_plate),
	textColumn('lines', m.stock_col_lines),
	textColumn('sentBy', m.stock_sent_by)
];

/** Transfers that arrived with something missing. */
export const shortColumns: ColumnDef<Short>[] = [
	transfer<Short>(),
	textColumn('from', m.stock_col_from),
	textColumn('to', m.stock_col_to),
	sent<Short>(),
	{
		accessorKey: 'receivedAt',
		get header() {
			return m.stock_received();
		},
		cell: (info) => {
			const v = info.getValue() as Date | string | null;
			return v ? formatEthiopianDate(new Date(v)) : '';
		}
	},
	textColumn('lost', m.stock_did_not_arrive),
	textColumn('driverName', m.stock_driver),
	textColumn('vehiclePlate', m.stock_col_plate),
	textColumn('receivedBy', m.stock_received_by)
];
