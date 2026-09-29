<script lang="ts">
	import type { ColumnDef } from '@tanstack/table-core';
	import DataTable from '@nahu/admin-kit/components/Table/data-table.svelte';
	import DataTableLinks from '@nahu/admin-kit/components/Table/data-table-links.svelte';
	import { renderComponent } from '@nahu/admin-kit/components/ui/data-table/index.js';
	import { formatETB } from '@nahu/admin-kit/global';
	import { ethiopianDateTime } from '@nahu/admin-kit/tableCells';
	import { m } from '$lib/paraglide/messages.js';

	let { data } = $props();
	type Row = (typeof data.shifts)[number];
	const etb = (v: unknown) => (v == null ? '—' : formatETB(Number(v)));

	const columns: ColumnDef<Row>[] = [
		{
			accessorKey: 'id',
			header: m.sales_shift(),
			cell: ({ row }) =>
				renderComponent(DataTableLinks, {
					id: row.original.id,
					name: `#${row.original.id}`,
					entity: 'shift'
				})
		},
		{ accessorKey: 'cashier', header: m.sales_cashier() },
		{ accessorKey: 'location', header: m.sales_till_at() },
		{
			accessorKey: 'openedAt',
			header: m.sales_opened(),
			cell: (i) => ethiopianDateTime(i.getValue())
		},
		{
			accessorKey: 'closedAt',
			header: m.sales_closed(),
			cell: (i) => (i.getValue() ? ethiopianDateTime(i.getValue()) : m.sales_shift_open())
		},
		{
			accessorKey: 'expectedCash',
			header: m.sales_cash_expected(),
			cell: (i) => etb(i.getValue())
		},
		{ accessorKey: 'countedCash', header: m.sales_cash_counted(), cell: (i) => etb(i.getValue()) },
		{
			accessorKey: 'difference',
			header: m.sales_over_short(),
			cell: (i) => {
				const v = i.getValue() as number | null;
				return v == null ? '—' : v === 0 ? m.sales_exact() : `${v > 0 ? '+' : ''}${formatETB(v)}`;
			}
		},
		{
			accessorKey: 'status',
			header: m.common_status(),
			cell: (i) => (i.getValue() === 'open' ? m.sales_shift_open() : m.sales_shift_closed())
		}
	];
</script>

<svelte:head>
	<title>{m.sales_shifts_title()}</title>
</svelte:head>

<div class="flex flex-col gap-4">
	<div>
		<h1 class="text-2xl font-semibold">{m.sales_shifts_title()}</h1>
		<p class="text-muted-foreground">
			{data.all ? m.sales_shifts_intro_all() : m.sales_shifts_intro_mine()}
		</p>
	</div>
	<DataTable
		data={data.shifts}
		{columns}
		fileName={m.sales_shifts_title()}
		facetKeys={['cashier', 'status']}
	/>
</div>
