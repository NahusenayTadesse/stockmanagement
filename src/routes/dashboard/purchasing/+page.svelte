<script lang="ts">
	import Plus from '@lucide/svelte/icons/plus';
	import RefreshCw from '@lucide/svelte/icons/refresh-cw';
	import { resolve } from '$app/paths';
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
	import { orderHeader, PO_STATUS_LABELS } from '$lib/schemas/purchasing';
	import OrderHeaderFields from './OrderHeaderFields.svelte';
	import { m } from '$lib/paraglide/messages.js';

	let { data } = $props();
	let open = $state(false);

	// svelte-ignore state_referenced_locally
	const { form, errors, enhance, delayed, allErrors } = createForm(data.form, orderHeader);

	type Row = (typeof data.orders)[number];
	const columns: ColumnDef<Row>[] = [
		{
			accessorKey: 'number',
			header: m.purchasing_col_order(),
			cell: ({ row }) =>
				renderComponent(DataTableLinks, {
					id: row.original.id,
					name: row.original.number ?? m.purchasing_draft_number({ id: row.original.id }),
					entity: 'purchaseOrder'
				})
		},
		{
			accessorKey: 'supplier',
			header: m.purchasing_col_supplier(),
			cell: ({ row }) =>
				renderComponent(DataTableLinks, {
					id: row.original.supplierId,
					name: row.original.supplier,
					entity: 'supplier'
				})
		},
		{
			accessorKey: 'orderDate',
			header: m.purchasing_col_ordered(),
			cell: (info) => ethiopianDate(info.getValue())
		},
		{
			accessorKey: 'expectedDate',
			header: m.purchasing_col_expected(),
			cell: (info) => (info.getValue() ? ethiopianDate(info.getValue()) : '')
		},
		{ accessorKey: 'location', header: m.purchasing_col_deliver_to() },
		{ accessorKey: 'lines', header: m.purchasing_col_lines() },
		{
			accessorKey: 'value',
			header: m.purchasing_col_value(),
			cell: (info) => formatETB(Number(info.getValue()))
		},
		{ accessorKey: 'receipts', header: m.purchasing_col_deliveries() },
		{
			accessorKey: 'status',
			header: m.common_status(),
			cell: ({ row }) => PO_STATUS_LABELS[row.original.status]
		}
	];
</script>

<svelte:head>
	<title>{m.purchasing_orders_title()}</title>
</svelte:head>

<div class="flex flex-col gap-4">
	<div class="flex flex-wrap items-center justify-between gap-2">
		<div>
			<h1 class="text-2xl font-semibold">{m.purchasing_orders_title()}</h1>
			<p class="text-muted-foreground">
				{m.purchasing_orders_intro()}
			</p>
		</div>
		<div class="flex flex-wrap gap-2">
			<Button href={resolve('/dashboard/purchasing/reorder')} variant="outline"
				><RefreshCw /> {m.purchasing_what_to_reorder()}</Button
			>
			{#if data.canManage}
				<DialogComp bind:open title={m.purchasing_new_order()} variant="default" IconComp={Plus}>
					<form
						method="POST"
						action="?/create"
						use:enhance
						id="new-order"
						class="flex flex-col gap-4"
					>
						<Errors allErrors={$allErrors} />
						<OrderHeaderFields
							{form}
							{errors}
							suppliers={data.suppliers}
							locations={data.locations}
							supplierForm={data.supplierForm}
						/>
						<Button type="submit" form="new-order">
							{#if $delayed}<LoadingBtn
									name={m.purchasing_creating()}
								/>{:else}{m.purchasing_create_draft_order()}{/if}
						</Button>
					</form>
				</DialogComp>
			{/if}
		</div>
	</div>

	<DataTable
		data={data.orders}
		{columns}
		fileName={m.purchasing_orders_title()}
		facetKeys={['status', 'supplier']}
	/>
</div>
