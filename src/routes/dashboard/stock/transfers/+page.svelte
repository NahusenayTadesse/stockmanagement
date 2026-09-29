<script lang="ts">
	import { m } from '$lib/paraglide/messages.js';
	import type { ColumnDef } from '@tanstack/table-core';
	import DataTable from '@nahu/admin-kit/components/Table/data-table.svelte';
	import DataTableLinks from '@nahu/admin-kit/components/Table/data-table-links.svelte';
	import { renderComponent } from '@nahu/admin-kit/components/ui/data-table/index.js';
	import { ethiopianDate } from '@nahu/admin-kit/tableCells';
	import { formatEthiopianDate } from '@nahu/admin-kit/global';

	let { data } = $props();

	type Road = (typeof data.onTheRoad)[number];
	type Short = (typeof data.short)[number];

	const docLink = (row: { id: number; number: string | null }) =>
		renderComponent(DataTableLinks, {
			id: row.id,
			name: row.number ?? `#${row.id}`,
			entity: 'document'
		});

	const roadColumns: ColumnDef<Road>[] = [
		{
			accessorKey: 'number',
			header: m.stock_col_transfer(),
			cell: ({ row }) => docLink(row.original)
		},
		{ accessorKey: 'from', header: m.stock_col_from() },
		{ accessorKey: 'to', header: m.stock_col_to() },
		{
			accessorKey: 'docDate',
			header: m.stock_sent(),
			cell: (info) => ethiopianDate(info.getValue())
		},
		{
			accessorKey: 'days',
			header: m.stock_days_on_road(),
			cell: (info) => {
				const d = Number(info.getValue());
				return d === 0
					? m.stock_today()
					: d === 1
						? m.stock_one_day()
						: m.stock_n_days({ days: d });
			}
		},
		{ accessorKey: 'driverName', header: m.stock_driver(), cell: (info) => info.getValue() ?? '' },
		{
			accessorKey: 'vehiclePlate',
			header: m.stock_col_plate(),
			cell: (info) => info.getValue() ?? ''
		},
		{ accessorKey: 'lines', header: m.stock_col_lines() },
		{ accessorKey: 'sentBy', header: m.stock_sent_by(), cell: (info) => info.getValue() ?? '' }
	];

	const shortColumns: ColumnDef<Short>[] = [
		{
			accessorKey: 'number',
			header: m.stock_col_transfer(),
			cell: ({ row }) => docLink(row.original)
		},
		{ accessorKey: 'from', header: m.stock_col_from() },
		{ accessorKey: 'to', header: m.stock_col_to() },
		{
			accessorKey: 'docDate',
			header: m.stock_sent(),
			cell: (info) => ethiopianDate(info.getValue())
		},
		{
			accessorKey: 'receivedAt',
			header: m.stock_received(),
			cell: (info) => {
				const v = info.getValue() as Date | string | null;
				return v ? formatEthiopianDate(new Date(v)) : '';
			}
		},
		{ accessorKey: 'lost', header: m.stock_did_not_arrive() },
		{ accessorKey: 'driverName', header: m.stock_driver(), cell: (info) => info.getValue() ?? '' },
		{
			accessorKey: 'vehiclePlate',
			header: m.stock_col_plate(),
			cell: (info) => info.getValue() ?? ''
		},
		{
			accessorKey: 'receivedBy',
			header: m.stock_received_by(),
			cell: (info) => info.getValue() ?? ''
		}
	];
</script>

<svelte:head>
	<title>{m.stock_transfers_title()}</title>
</svelte:head>

<div class="flex flex-col gap-6">
	<div>
		<h1 class="text-2xl font-semibold">{m.stock_transfers_title()}</h1>
		<p class="text-muted-foreground">
			{m.stock_transfers_intro()}
		</p>
	</div>

	<section class="flex flex-col gap-2">
		<h2 class="text-xl font-semibold">
			{m.stock_on_the_road_count({ count: data.onTheRoad.length })}
		</h2>
		<DataTable data={data.onTheRoad} columns={roadColumns} fileName={m.stock_transfers_title()} />
	</section>

	<section class="flex flex-col gap-2">
		<h2 class="text-xl font-semibold">{m.stock_arrived_short()}</h2>
		<p class="text-sm text-muted-foreground">
			{m.stock_arrived_short_hint({ days: data.lossDays })}
		</p>
		<DataTable data={data.short} columns={shortColumns} fileName={m.stock_arrived_short_file()} />
	</section>
</div>
