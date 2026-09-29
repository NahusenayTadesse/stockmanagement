<script lang="ts">
	import {
		dateCell,
		longText,
		moneyCell,
		NAME_LENGTH,
		sortable,
		documentStatusCell,
		textColumn
	} from '$lib/table';
	import PageHeader from '@nahu/admin-kit/components/PageHeader.svelte';
	import FilterBar from '$lib/components/filters/FilterBar.svelte';
	import DateRangeFields from '$lib/components/filters/DateRangeFields.svelte';
	import DatePresets from '$lib/components/filters/DatePresets.svelte';
	import { resolve } from '$app/paths';
	import Calculator from '@lucide/svelte/icons/calculator';
	import FileText from '@lucide/svelte/icons/file-text';
	import type { ColumnDef } from '@tanstack/table-core';
	import DataTable from '@nahu/admin-kit/components/Table/data-table.svelte';
	import DataTableLinks from '@nahu/admin-kit/components/Table/data-table-links.svelte';
	import StatCard from '$lib/components/StatCard.svelte';
	import { renderComponent } from '@nahu/admin-kit/components/ui/data-table/index.js';
	import { Button } from '@nahu/admin-kit/components/ui/button/index.js';
	import { formatETB } from '@nahu/admin-kit/global';
	import { EINVOICE_STATUS_LABELS } from '$lib/format';
	import { m } from '$lib/paraglide/messages.js';

	let { data } = $props();
	type Row = (typeof data.sales)[number];
	const f = $derived(data.filters);

	const columns: ColumnDef<Row>[] = [
		{ accessorKey: 'docDate', header: sortable(m.common_date), cell: dateCell },
		{
			accessorKey: 'number',
			header: sortable(m.sales_number),
			cell: ({ row }) =>
				renderComponent(DataTableLinks, {
					id: row.original.id,
					name: row.original.number ?? m.sales_draft_number({ id: row.original.id }),
					entity: 'document'
				})
		},
		textColumn<Row>('kind', m.sales_kind),
		{ accessorKey: 'buyer', header: sortable(m.sales_customer), cell: longText(NAME_LENGTH) },
		textColumn<Row>('channel', m.sales_where),
		{
			accessorKey: 'total',
			header: sortable(m.common_total),
			cell: moneyCell,
			meta: { align: 'right' }
		},
		{
			accessorKey: 'paid',
			header: sortable(m.sales_paid),
			cell: moneyCell,
			meta: { align: 'right' }
		},
		{
			accessorKey: 'balance',
			meta: { align: 'right' },
			header: sortable(m.sales_on_account),
			cell: (i) => (Number(i.getValue()) ? formatETB(Number(i.getValue())) : '—')
		},
		{
			accessorKey: 'fsNumber',
			get header() {
				return m.sales_fs_no();
			},
			cell: (i) => i.getValue() ?? '—'
		},
		{
			accessorKey: 'einvoiceStatus',
			get header() {
				return m.sales_einvoice();
			},
			cell: (i) => {
				const v = i.getValue() as string | null;
				return v ? (EINVOICE_STATUS_LABELS[v] ?? v) : '—';
			}
		},
		{
			accessorKey: 'status',
			get header() {
				return m.common_status();
			},
			cell: ({ row }) => documentStatusCell(row.original.status)
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

<div class="flex flex-col gap-4">
	<PageHeader
		title={m.sales_register_heading()}
		tabTitle={m.sales_register_title()}
		description={m.sales_register_intro()}
	>
		{#snippet actions()}
			<Button href={resolve('/dashboard/sales/quotes')} variant="outline"
				><FileText /> {m.nav_proformas()}</Button
			>
			<Button href={resolve('/dashboard/pos')}><Calculator /> {m.sales_channel_till()}</Button>
		{/snippet}
	</PageHeader>

	<FilterBar submitLabel={m.sales_show()}>
		<DateRangeFields from={f.from} to={f.to} />
		{#snippet after()}
			<DatePresets presets={data.presets} from={f.from} to={f.to} />
		{/snippet}
	</FilterBar>

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
		variant="list"
		fileName={m.sales_file_range({ from: f.from, to: f.to })}
		facetKeys={['kind', 'channel', 'status']}
	/>
</div>
