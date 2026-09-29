<script lang="ts">
	import { resolve } from '$app/paths';
	import Calculator from '@lucide/svelte/icons/calculator';
	import FileText from '@lucide/svelte/icons/file-text';
	import type { ColumnDef } from '@tanstack/table-core';
	import DataTable from '@nahu/admin-kit/components/Table/data-table.svelte';
	import DataTableLinks from '@nahu/admin-kit/components/Table/data-table-links.svelte';
	import StatCard from '@nahu/admin-kit/components/reports/StatCard.svelte';
	import { renderComponent } from '@nahu/admin-kit/components/ui/data-table/index.js';
	import { Button } from '@nahu/admin-kit/components/ui/button/index.js';
	import { Input } from '@nahu/admin-kit/components/ui/input/index.js';
	import { formatETB } from '@nahu/admin-kit/global';
	import { ethiopianDate } from '@nahu/admin-kit/tableCells';

	let { data } = $props();
	type Row = (typeof data.sales)[number];
	const f = $derived(data.filters);

	const columns: ColumnDef<Row>[] = [
		{ accessorKey: 'docDate', header: 'Date', cell: (i) => ethiopianDate(i.getValue()) },
		{
			accessorKey: 'number',
			header: 'Number',
			cell: ({ row }) =>
				renderComponent(DataTableLinks, {
					id: row.original.id,
					name: row.original.number ?? `Draft #${row.original.id}`,
					entity: 'document'
				})
		},
		{ accessorKey: 'kind', header: 'Kind' },
		{ accessorKey: 'buyer', header: 'Customer' },
		{ accessorKey: 'channel', header: 'Where' },
		{ accessorKey: 'total', header: 'Total', cell: (i) => formatETB(Number(i.getValue())) },
		{ accessorKey: 'paid', header: 'Paid', cell: (i) => formatETB(Number(i.getValue())) },
		{
			accessorKey: 'balance',
			header: 'On account',
			cell: (i) => (Number(i.getValue()) ? formatETB(Number(i.getValue())) : '—')
		},
		{ accessorKey: 'fsNumber', header: 'FS No.', cell: (i) => i.getValue() ?? '—' },
		{ accessorKey: 'einvoiceStatus', header: 'E-invoice', cell: (i) => i.getValue() ?? '—' },
		{ accessorKey: 'status', header: 'Status' },
		{
			id: 'invoice',
			header: '',
			cell: ({ row }) =>
				row.original.status === 'posted'
					? renderComponent(DataTableLinks, {
							id: `${row.original.id}/invoice`,
							name: 'Invoice',
							entity: 'sale',
							target: '_blank'
						})
					: ''
		}
	];
</script>

<svelte:head>
	<title>Sales</title>
</svelte:head>

<div class="flex flex-col gap-4">
	<div class="flex flex-wrap items-start justify-between gap-2">
		<div>
			<h1 class="text-2xl font-semibold">Sales & invoices</h1>
			<p class="text-muted-foreground">
				Every sale with prices — from the till, a proforma or the office — and every customer
				return, VAT and TOT included.
			</p>
		</div>
		<div class="flex gap-2">
			<Button href={resolve('/dashboard/sales/quotes')} variant="outline"
				><FileText /> Proformas</Button
			>
			<Button href={resolve('/dashboard/pos')}><Calculator /> Till</Button>
		</div>
	</div>

	<div class="flex flex-wrap items-end gap-2">
		{#each data.presets as p (p.key)}
			<Button
				size="sm"
				href="?from={p.from}&to={p.to}"
				variant={p.from === f.from && p.to === f.to ? 'default' : 'outline'}>{p.label}</Button
			>
		{/each}
		<form method="GET" class="flex items-end gap-2">
			<Input name="from" type="date" value={f.from} class="h-8" />
			<Input name="to" type="date" value={f.to} class="h-8" />
			<Button type="submit" size="sm" variant="outline">Show</Button>
		</form>
	</div>

	<div class="grid gap-4 sm:grid-cols-4">
		<StatCard
			stat={{ key: 'n', label: 'Sales', value: data.totals.count, format: 'count', group: 's' }}
		/>
		<StatCard
			stat={{
				key: 'sold',
				label: 'Sold (less returns)',
				value: data.totals.sold,
				format: 'money',
				group: 's'
			}}
		/>
		<StatCard
			stat={{
				key: 'got',
				label: 'Collected on them',
				value: data.totals.collected,
				format: 'money',
				group: 's',
				tone: 'positive'
			}}
		/>
		<StatCard
			stat={{
				key: 'acct',
				label: 'Left on account',
				value: data.totals.onAccount,
				format: 'money',
				group: 's',
				tone: data.totals.onAccount > 0 ? 'warning' : 'neutral'
			}}
		/>
	</div>

	<DataTable
		data={data.sales}
		{columns}
		fileName="Sales {f.from} to {f.to}"
		facetKeys={['kind', 'channel', 'status']}
	/>
</div>
