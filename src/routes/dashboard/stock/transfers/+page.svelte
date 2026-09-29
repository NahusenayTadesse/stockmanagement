<script lang="ts">
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
		{ accessorKey: 'number', header: 'Transfer', cell: ({ row }) => docLink(row.original) },
		{ accessorKey: 'from', header: 'From' },
		{ accessorKey: 'to', header: 'To' },
		{ accessorKey: 'docDate', header: 'Sent', cell: (info) => ethiopianDate(info.getValue()) },
		{
			accessorKey: 'days',
			header: 'Days on the road',
			cell: (info) => {
				const d = Number(info.getValue());
				return d === 0 ? 'Today' : d === 1 ? '1 day' : `${d} days`;
			}
		},
		{ accessorKey: 'driverName', header: 'Driver', cell: (info) => info.getValue() ?? '' },
		{ accessorKey: 'vehiclePlate', header: 'Plate', cell: (info) => info.getValue() ?? '' },
		{ accessorKey: 'lines', header: 'Lines' },
		{ accessorKey: 'sentBy', header: 'Sent by', cell: (info) => info.getValue() ?? '' }
	];

	const shortColumns: ColumnDef<Short>[] = [
		{ accessorKey: 'number', header: 'Transfer', cell: ({ row }) => docLink(row.original) },
		{ accessorKey: 'from', header: 'From' },
		{ accessorKey: 'to', header: 'To' },
		{ accessorKey: 'docDate', header: 'Sent', cell: (info) => ethiopianDate(info.getValue()) },
		{
			accessorKey: 'receivedAt',
			header: 'Received',
			cell: (info) => {
				const v = info.getValue() as Date | string | null;
				return v ? formatEthiopianDate(new Date(v)) : '';
			}
		},
		{ accessorKey: 'lost', header: 'Did not arrive' },
		{ accessorKey: 'driverName', header: 'Driver', cell: (info) => info.getValue() ?? '' },
		{ accessorKey: 'vehiclePlate', header: 'Plate', cell: (info) => info.getValue() ?? '' },
		{ accessorKey: 'receivedBy', header: 'Received by', cell: (info) => info.getValue() ?? '' }
	];
</script>

<svelte:head>
	<title>Transfers in transit</title>
</svelte:head>

<div class="flex flex-col gap-6">
	<div>
		<h1 class="text-2xl font-semibold">Transfers in transit</h1>
		<p class="text-muted-foreground">
			Stock sent between branches and not yet received. The receiving branch opens the transfer and
			records what arrived; anything missing is written off as lost in transit.
		</p>
	</div>

	<section class="flex flex-col gap-2">
		<h2 class="text-xl font-semibold">On the road ({data.onTheRoad.length})</h2>
		<DataTable data={data.onTheRoad} columns={roadColumns} fileName="Transfers in transit" />
	</section>

	<section class="flex flex-col gap-2">
		<h2 class="text-xl font-semibold">Arrived short</h2>
		<p class="text-sm text-muted-foreground">
			Transfers received in the last {data.lossDays} days where something did not arrive.
		</p>
		<DataTable data={data.short} columns={shortColumns} fileName="Transfers arrived short" />
	</section>
</div>
