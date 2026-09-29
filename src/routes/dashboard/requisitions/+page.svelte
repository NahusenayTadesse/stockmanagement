<script lang="ts">
	import Plus from '@lucide/svelte/icons/plus';
	import type { ColumnDef } from '@tanstack/table-core';
	import DataTable from '@nahu/admin-kit/components/Table/data-table.svelte';
	import DataTableLinks from '@nahu/admin-kit/components/Table/data-table-links.svelte';
	import Statuses from '@nahu/admin-kit/components/Table/statuses.svelte';
	import { renderComponent } from '@nahu/admin-kit/components/ui/data-table/index.js';
	import { Button } from '@nahu/admin-kit/components/ui/button/index.js';
	import DialogComp from '@nahu/admin-kit/formComponents/DialogComp.svelte';
	import LoadingBtn from '@nahu/admin-kit/formComponents/LoadingBtn.svelte';
	import Errors from '@nahu/admin-kit/formComponents/Errors.svelte';
	import { createForm } from '@nahu/admin-kit/forms/createForm';
	import { ethiopianDate } from '@nahu/admin-kit/tableCells';
	import {
		REQUISITION_BADGE,
		REQUISITION_STATUS_LABELS,
		requisitionHeader
	} from '$lib/schemas/requisitions';
	import RequisitionHeaderFields from './RequisitionHeaderFields.svelte';

	let { data } = $props();
	let open = $state(false);

	// svelte-ignore state_referenced_locally
	const { form, errors, enhance, delayed, allErrors } = createForm(data.form, requisitionHeader);

	type Row = (typeof data.requisitions)[number];
	const columns: ColumnDef<Row>[] = [
		{
			accessorKey: 'number',
			header: 'Requisition',
			cell: ({ row }) =>
				renderComponent(DataTableLinks, {
					id: row.original.id,
					name: row.original.number ?? `Draft #${row.original.id}`,
					entity: 'requisition'
				})
		},
		{ accessorKey: 'department', header: 'Department' },
		{
			accessorKey: 'requestDate',
			header: 'Date',
			cell: (info) => ethiopianDate(info.getValue())
		},
		{
			accessorKey: 'neededBy',
			header: 'Needed by',
			cell: (info) => (info.getValue() ? ethiopianDate(info.getValue()) : '')
		},
		{ accessorKey: 'location', header: 'From store' },
		{ accessorKey: 'branch', header: 'Branch' },
		{ accessorKey: 'lines', header: 'Lines' },
		{ accessorKey: 'submittedBy', header: 'Asked by', cell: (info) => info.getValue() ?? '' },
		{
			accessorKey: 'issueId',
			header: 'Issue',
			cell: ({ row }) =>
				row.original.issueId
					? renderComponent(DataTableLinks, {
							id: row.original.issueId,
							name: `#${row.original.issueId}`,
							entity: 'document'
						})
					: ''
		},
		{
			id: 'status',
			// Filtered and exported by the words people read, not the badge's.
			accessorFn: (r) => REQUISITION_STATUS_LABELS[r.status],
			header: 'Status',
			cell: ({ row }) =>
				renderComponent(Statuses, { status: REQUISITION_BADGE[row.original.status] })
		}
	];
</script>

<svelte:head>
	<title>Requisitions</title>
</svelte:head>

<div class="flex flex-col gap-4">
	<div class="flex flex-wrap items-center justify-between gap-2">
		<div>
			<h1 class="text-2xl font-semibold">Requisitions</h1>
			<p class="text-muted-foreground">
				What departments ask the store for. Asked, approved by someone else, then issued from the
				store.
				{#if data.waiting}<strong>{data.waiting} waiting for approval.</strong>{/if}
				{#if data.toIssue}<strong>{data.toIssue} approved, to issue.</strong>{/if}
			</p>
		</div>
		{#if data.canRequest}
			<DialogComp bind:open title="New requisition" variant="default" IconComp={Plus}>
				<form
					method="POST"
					action="?/create"
					use:enhance
					id="new-requisition"
					class="flex flex-col gap-4"
				>
					<Errors allErrors={$allErrors} />
					<RequisitionHeaderFields
						{form}
						{errors}
						locations={data.locations}
						departments={data.departments}
					/>
					<Button type="submit" form="new-requisition">
						{#if $delayed}<LoadingBtn name="Creating" />{:else}Create draft{/if}
					</Button>
				</form>
			</DialogComp>
		{/if}
	</div>

	<DataTable
		data={data.requisitions}
		{columns}
		fileName="Requisitions"
		facetKeys={['status', 'department']}
	/>
</div>
