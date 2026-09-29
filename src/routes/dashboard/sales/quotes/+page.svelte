<script lang="ts">
	import { dateCell, longText, moneyCell, NAME_LENGTH, sortable, statusCell } from '$lib/table';
	import PageHeader from '@nahu/admin-kit/components/PageHeader.svelte';
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
	import { quoteHeader, QUOTE_STATUS_LABELS } from '$lib/schemas/quotes';
	import QuoteHeaderFields from './QuoteHeaderFields.svelte';
	import { m } from '$lib/paraglide/messages.js';

	let { data } = $props();
	let open = $state(false);

	// svelte-ignore state_referenced_locally
	const { form, errors, enhance, delayed, allErrors } = createForm(data.form, quoteHeader);

	type Row = (typeof data.quotes)[number];
	/** The colour of each state, from the kit's badge set. */
	const STATUS_COLOUR: Record<string, string> = {
		draft: 'pending',
		sent: 'pending',
		accepted: 'approved',
		converted: 'complete',
		expired: 'closed',
		cancelled: 'cancelled'
	};
	const columns: ColumnDef<Row>[] = [
		{
			accessorKey: 'number',
			header: sortable(m.sales_proforma),
			cell: ({ row }) =>
				renderComponent(DataTableLinks, {
					id: row.original.id,
					name: row.original.number ?? m.sales_draft_number({ id: row.original.id }),
					entity: 'quote'
				})
		},
		{ accessorKey: 'buyer', header: sortable(m.sales_for), cell: longText(NAME_LENGTH) },
		{ accessorKey: 'quoteDate', header: sortable(m.common_date), cell: dateCell },
		{
			accessorKey: 'validUntil',
			header: sortable(m.sales_valid_until),
			cell: (i) => (i.getValue() ? dateCell(i) : '—')
		},
		{
			accessorKey: 'net',
			header: sortable(m.sales_pos_before_tax),
			cell: moneyCell,
			meta: { align: 'right' }
		},
		{
			accessorKey: 'status',
			get header() {
				return m.common_status();
			},
			cell: (i) => {
				const status = i.getValue() as string;
				return statusCell(STATUS_COLOUR[status], QUOTE_STATUS_LABELS[status] ?? status);
			}
		}
	];
</script>

<div class="flex flex-col gap-4">
	<PageHeader title={m.sales_quotes_title()} description={m.sales_quotes_intro()}>
		{#snippet actions()}
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
		{/snippet}
	</PageHeader>
	<DataTable
		data={data.quotes}
		{columns}
		variant="list"
		fileName={m.sales_quotes_title()}
		facetKeys={['status']}
	/>
</div>
