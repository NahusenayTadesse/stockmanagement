<script lang="ts">
	import type { ColumnDef } from '@tanstack/table-core';
	import DataTable from '@nahu/admin-kit/components/Table/data-table.svelte';
	import DataTableLinks from '@nahu/admin-kit/components/Table/data-table-links.svelte';
	import { renderComponent } from '@nahu/admin-kit/components/ui/data-table/index.js';
	import { formatETB } from '@nahu/admin-kit/global';
	import { ethiopianDateTime } from '@nahu/admin-kit/tableCells';

	let { data } = $props();
	type Row = (typeof data.shifts)[number];
	const etb = (v: unknown) => (v == null ? '—' : formatETB(Number(v)));

	const columns: ColumnDef<Row>[] = [
		{
			accessorKey: 'id',
			header: 'Shift',
			cell: ({ row }) =>
				renderComponent(DataTableLinks, {
					id: row.original.id,
					name: `#${row.original.id}`,
					entity: 'shift'
				})
		},
		{ accessorKey: 'cashier', header: 'Cashier' },
		{ accessorKey: 'location', header: 'Till at' },
		{ accessorKey: 'openedAt', header: 'Opened', cell: (i) => ethiopianDateTime(i.getValue()) },
		{
			accessorKey: 'closedAt',
			header: 'Closed',
			cell: (i) => (i.getValue() ? ethiopianDateTime(i.getValue()) : 'open')
		},
		{ accessorKey: 'expectedCash', header: 'Cash expected', cell: (i) => etb(i.getValue()) },
		{ accessorKey: 'countedCash', header: 'Cash counted', cell: (i) => etb(i.getValue()) },
		{
			accessorKey: 'difference',
			header: 'Over / short',
			cell: (i) => {
				const v = i.getValue() as number | null;
				return v == null ? '—' : v === 0 ? 'exact' : `${v > 0 ? '+' : ''}${formatETB(v)}`;
			}
		},
		{ accessorKey: 'status', header: 'Status' }
	];
</script>

<svelte:head>
	<title>Till shifts</title>
</svelte:head>

<div class="flex flex-col gap-4">
	<div>
		<h1 class="text-2xl font-semibold">Till shifts</h1>
		<p class="text-muted-foreground">
			{data.all ? 'Every till shift' : 'Your till shifts'}: opened with a float, closed by counting
			the drawer against the cash the shift took.
		</p>
	</div>
	<DataTable
		data={data.shifts}
		{columns}
		fileName="Till shifts"
		facetKeys={['cashier', 'status']}
	/>
</div>
