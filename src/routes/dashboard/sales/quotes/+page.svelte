<script lang="ts">
	import Plus from '@lucide/svelte/icons/plus';
	import type { ColumnDef } from '@tanstack/table-core';
	import DataTable from '@nahu/admin-kit/components/Table/data-table.svelte';
	import DataTableLinks from '@nahu/admin-kit/components/Table/data-table-links.svelte';
	import { renderComponent } from '@nahu/admin-kit/components/ui/data-table/index.js';
	import { Button } from '@nahu/admin-kit/components/ui/button/index.js';
	import DialogComp from '@nahu/admin-kit/formComponents/DialogComp.svelte';
	import LoadingBtn from '@nahu/admin-kit/formComponents/LoadingBtn.svelte';
	import Errors from '@nahu/admin-kit/formComponents/Errors.svelte';
	import { createForm } from '@nahu/admin-kit/forms/createForm';
	import { formatETB } from '@nahu/admin-kit/global';
	import { ethiopianDate } from '@nahu/admin-kit/tableCells';
	import { quoteHeader, QUOTE_STATUS_LABELS } from '$lib/schemas/quotes';
	import QuoteHeaderFields from './QuoteHeaderFields.svelte';

	let { data } = $props();
	let open = $state(false);

	// svelte-ignore state_referenced_locally
	const { form, errors, enhance, delayed, allErrors } = createForm(data.form, quoteHeader);

	type Row = (typeof data.quotes)[number];
	const columns: ColumnDef<Row>[] = [
		{
			accessorKey: 'number',
			header: 'Proforma',
			cell: ({ row }) =>
				renderComponent(DataTableLinks, {
					id: row.original.id,
					name: row.original.number ?? `Draft #${row.original.id}`,
					entity: 'quote'
				})
		},
		{ accessorKey: 'buyer', header: 'For' },
		{ accessorKey: 'quoteDate', header: 'Date', cell: (i) => ethiopianDate(i.getValue()) },
		{
			accessorKey: 'validUntil',
			header: 'Valid until',
			cell: (i) => (i.getValue() ? ethiopianDate(i.getValue()) : '—')
		},
		{ accessorKey: 'net', header: 'Before tax', cell: (i) => formatETB(Number(i.getValue())) },
		{
			accessorKey: 'status',
			header: 'Status',
			cell: (i) => QUOTE_STATUS_LABELS[i.getValue() as string] ?? i.getValue()
		}
	];
</script>

<svelte:head>
	<title>Proformas</title>
</svelte:head>

<div class="flex flex-col gap-4">
	<div class="flex flex-wrap items-start justify-between gap-2">
		<div>
			<h1 class="text-2xl font-semibold">Proformas</h1>
			<p class="text-muted-foreground">
				Priced offers, valid until a date — what government offices and NGOs buy against. Nothing
				leaves the shelf until one becomes a sale.
			</p>
		</div>
		{#if data.canManage}
			<DialogComp bind:open title="New proforma" variant="default" IconComp={Plus}>
				<form
					method="POST"
					action="?/create"
					use:enhance
					id="new-quote"
					class="flex flex-col gap-4"
				>
					<Errors allErrors={$allErrors} />
					<QuoteHeaderFields
						{form}
						{errors}
						customers={data.customers}
						locations={data.locations}
					/>
					<Button type="submit" form="new-quote">
						{#if $delayed}<LoadingBtn name="Creating" />{:else}Start proforma{/if}
					</Button>
				</form>
			</DialogComp>
		{/if}
	</div>
	<DataTable data={data.quotes} {columns} fileName="Proformas" facetKeys={['status']} />
</div>
