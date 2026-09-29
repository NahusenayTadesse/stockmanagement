<script lang="ts">
	import DateInput from '@nahu/admin-kit/formComponents/DateInput.svelte';
	import { resolve } from '$app/paths';
	import Calculator from '@lucide/svelte/icons/calculator';
	import FileText from '@lucide/svelte/icons/file-text';
	import type { ColumnDef } from '@tanstack/table-core';
	import DataTable from '@nahu/admin-kit/components/Table/data-table.svelte';
	import DataTableLinks from '@nahu/admin-kit/components/Table/data-table-links.svelte';
	import StatCard from '@nahu/admin-kit/components/reports/StatCard.svelte';
	import { renderComponent } from '@nahu/admin-kit/components/ui/data-table/index.js';
	import { Button } from '@nahu/admin-kit/components/ui/button/index.js';
	import { formatETB } from '@nahu/admin-kit/global';
	import { ethiopianDate } from '@nahu/admin-kit/tableCells';
	import { DOCUMENT_STATUS_LABELS, EINVOICE_STATUS_LABELS } from '$lib/format';
	import { m } from '$lib/paraglide/messages.js';

	let { data } = $props();
	type Row = (typeof data.sales)[number];
	const f = $derived(data.filters);

	const columns: ColumnDef<Row>[] = [
		{ accessorKey: 'docDate', header: m.common_date(), cell: (i) => ethiopianDate(i.getValue()) },
		{
			accessorKey: 'number',
			header: m.sales_number(),
			cell: ({ row }) =>
				renderComponent(DataTableLinks, {
					id: row.original.id,
					name: row.original.number ?? m.sales_draft_number({ id: row.original.id }),
					entity: 'document'
				})
		},
		{ accessorKey: 'kind', header: m.sales_kind() },
		{ accessorKey: 'buyer', header: m.sales_customer() },
		{ accessorKey: 'channel', header: m.sales_where() },
		{
			accessorKey: 'total',
			header: m.common_total(),
			cell: (i) => formatETB(Number(i.getValue()))
		},
		{ accessorKey: 'paid', header: m.sales_paid(), cell: (i) => formatETB(Number(i.getValue())) },
		{
			accessorKey: 'balance',
			header: m.sales_on_account(),
			cell: (i) => (Number(i.getValue()) ? formatETB(Number(i.getValue())) : '—')
		},
		{ accessorKey: 'fsNumber', header: m.sales_fs_no(), cell: (i) => i.getValue() ?? '—' },
		{
			accessorKey: 'einvoiceStatus',
			header: m.sales_einvoice(),
			cell: (i) => {
				const v = i.getValue() as string | null;
				return v ? (EINVOICE_STATUS_LABELS[v] ?? v) : '—';
			}
		},
		{
			accessorKey: 'status',
			header: m.common_status(),
			cell: (i) =>
				DOCUMENT_STATUS_LABELS[i.getValue() as keyof typeof DOCUMENT_STATUS_LABELS] ?? i.getValue()
		},
		{
			id: 'invoice',
			header: '',
			cell: ({ row }) =>
				row.original.status === 'posted'
					? renderComponent(DataTableLinks, {
							id: `${row.original.id}/invoice`,
							name: m.sales_invoice(),
							entity: 'sale',
							target: '_blank'
						})
					: ''
		}
	];
</script>

<svelte:head>
	<title>{m.sales_register_title()}</title>
</svelte:head>

<div class="flex flex-col gap-4">
	<div class="flex flex-wrap items-start justify-between gap-2">
		<div>
			<h1 class="text-2xl font-semibold">{m.sales_register_heading()}</h1>
			<p class="text-muted-foreground">{m.sales_register_intro()}</p>
		</div>
		<div class="flex gap-2">
			<Button href={resolve('/dashboard/sales/quotes')} variant="outline"
				><FileText /> {m.nav_proformas()}</Button
			>
			<Button href={resolve('/dashboard/pos')}><Calculator /> {m.sales_channel_till()}</Button>
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
			<DateInput name="from" value={f.from} />
			<DateInput name="to" value={f.to} />
			<Button type="submit" size="sm" variant="outline">{m.sales_show()}</Button>
		</form>
	</div>

	<div class="grid gap-4 sm:grid-cols-4">
		<StatCard
			stat={{
				key: 'n',
				label: m.sales_sales(),
				value: data.totals.count,
				format: 'count',
				group: 's'
			}}
		/>
		<StatCard
			stat={{
				key: 'sold',
				label: m.sales_sold_less_returns(),
				value: data.totals.sold,
				format: 'money',
				group: 's'
			}}
		/>
		<StatCard
			stat={{
				key: 'got',
				label: m.sales_collected(),
				value: data.totals.collected,
				format: 'money',
				group: 's',
				tone: 'positive'
			}}
		/>
		<StatCard
			stat={{
				key: 'acct',
				label: m.sales_left_on_account(),
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
		fileName={m.sales_file_range({ from: f.from, to: f.to })}
		facetKeys={['kind', 'channel', 'status']}
	/>
</div>
