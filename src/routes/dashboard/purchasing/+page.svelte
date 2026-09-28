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

	let { data } = $props();
	let open = $state(false);

	// svelte-ignore state_referenced_locally
	const { form, errors, enhance, delayed, allErrors } = createForm(data.form, orderHeader);

	type Row = (typeof data.orders)[number];
	const columns: ColumnDef<Row>[] = [
		{
			accessorKey: 'number',
			header: 'Order',
			cell: ({ row }) =>
				renderComponent(DataTableLinks, {
					id: row.original.id,
					name: row.original.number ?? `Draft #${row.original.id}`,
					entity: 'purchaseOrder'
				})
		},
		{
			accessorKey: 'supplier',
			header: 'Supplier',
			cell: ({ row }) =>
				renderComponent(DataTableLinks, {
					id: row.original.supplierId,
					name: row.original.supplier,
					entity: 'supplier'
				})
		},
		{ accessorKey: 'orderDate', header: 'Ordered', cell: (info) => ethiopianDate(info.getValue()) },
		{
			accessorKey: 'expectedDate',
			header: 'Expected',
			cell: (info) => (info.getValue() ? ethiopianDate(info.getValue()) : '')
		},
		{ accessorKey: 'location', header: 'Deliver to' },
		{ accessorKey: 'lines', header: 'Lines' },
		{ accessorKey: 'value', header: 'Value', cell: (info) => formatETB(Number(info.getValue())) },
		{ accessorKey: 'receipts', header: 'Deliveries' },
		{
			accessorKey: 'status',
			header: 'Status',
			cell: ({ row }) => PO_STATUS_LABELS[row.original.status]
		}
	];
</script>

<svelte:head>
	<title>Purchase orders</title>
</svelte:head>

<div class="flex flex-col gap-4">
	<div class="flex flex-wrap items-center justify-between gap-2">
		<div>
			<h1 class="text-2xl font-semibold">Purchase orders</h1>
			<p class="text-muted-foreground">
				What was ordered from whom, and what has arrived. Deliveries are received as goods receipts
				against the order.
			</p>
		</div>
		<div class="flex flex-wrap gap-2">
			<Button href={resolve('/dashboard/purchasing/reorder')} variant="outline"
				><RefreshCw /> What to reorder</Button
			>
			{#if data.canManage}
				<DialogComp bind:open title="New purchase order" variant="default" IconComp={Plus}>
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
							{#if $delayed}<LoadingBtn name="Creating" />{:else}Create draft order{/if}
						</Button>
					</form>
				</DialogComp>
			{/if}
		</div>
	</div>

	<DataTable
		data={data.orders}
		{columns}
		fileName="Purchase orders"
		facetKeys={['status', 'supplier']}
	/>
</div>
