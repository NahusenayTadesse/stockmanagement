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
	import { m } from '$lib/paraglide/messages.js';

	let { data } = $props();
	let open = $state(false);

	// svelte-ignore state_referenced_locally
	const { form, errors, enhance, delayed, allErrors } = createForm(data.form, quoteHeader);

	type Row = (typeof data.quotes)[number];
	const columns: ColumnDef<Row>[] = [
		{
			accessorKey: 'number',
			header: m.sales_proforma(),
			cell: ({ row }) =>
				renderComponent(DataTableLinks, {
					id: row.original.id,
					name: row.original.number ?? m.sales_draft_number({ id: row.original.id }),
					entity: 'quote'
				})
		},
		{ accessorKey: 'buyer', header: m.sales_for() },
		{ accessorKey: 'quoteDate', header: m.common_date(), cell: (i) => ethiopianDate(i.getValue()) },
		{
			accessorKey: 'validUntil',
			header: m.sales_valid_until(),
			cell: (i) => (i.getValue() ? ethiopianDate(i.getValue()) : '—')
		},
		{
			accessorKey: 'net',
			header: m.sales_pos_before_tax(),
			cell: (i) => formatETB(Number(i.getValue()))
		},
		{
			accessorKey: 'status',
			header: m.common_status(),
			cell: (i) => QUOTE_STATUS_LABELS[i.getValue() as string] ?? i.getValue()
		}
	];
</script>

<svelte:head>
	<title>{m.sales_quotes_title()}</title>
</svelte:head>

<div class="flex flex-col gap-4">
	<div class="flex flex-wrap items-start justify-between gap-2">
		<div>
			<h1 class="text-2xl font-semibold">{m.sales_quotes_title()}</h1>
			<p class="text-muted-foreground">{m.sales_quotes_intro()}</p>
		</div>
		{#if data.canManage}
			<DialogComp bind:open title={m.sales_new_quote()} variant="default" IconComp={Plus}>
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
						{#if $delayed}<LoadingBtn
								name={m.sales_creating()}
							/>{:else}{m.sales_start_quote()}{/if}
					</Button>
				</form>
			</DialogComp>
		{/if}
	</div>
	<DataTable
		data={data.quotes}
		{columns}
		fileName={m.sales_quotes_title()}
		facetKeys={['status']}
	/>
</div>
