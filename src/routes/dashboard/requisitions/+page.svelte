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
	import { m } from '$lib/paraglide/messages.js';

	let { data } = $props();
	let open = $state(false);

	// svelte-ignore state_referenced_locally
	const { form, errors, enhance, delayed, allErrors } = createForm(data.form, requisitionHeader);

	type Row = (typeof data.requisitions)[number];
	const columns: ColumnDef<Row>[] = [
		{
			accessorKey: 'number',
			header: m.purchasing_col_requisition(),
			cell: ({ row }) =>
				renderComponent(DataTableLinks, {
					id: row.original.id,
					name: row.original.number ?? m.purchasing_draft_number({ id: row.original.id }),
					entity: 'requisition'
				})
		},
		{ accessorKey: 'department', header: m.purchasing_col_department() },
		{
			accessorKey: 'requestDate',
			header: m.common_date(),
			cell: (info) => ethiopianDate(info.getValue())
		},
		{
			accessorKey: 'neededBy',
			header: m.purchasing_col_needed_by(),
			cell: (info) => (info.getValue() ? ethiopianDate(info.getValue()) : '')
		},
		{ accessorKey: 'location', header: m.purchasing_col_from_store() },
		{ accessorKey: 'branch', header: m.common_branch() },
		{ accessorKey: 'lines', header: m.purchasing_col_lines() },
		{
			accessorKey: 'submittedBy',
			header: m.purchasing_col_asked_by(),
			cell: (info) => info.getValue() ?? ''
		},
		{
			accessorKey: 'issueId',
			header: m.purchasing_col_issue(),
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
			header: m.common_status(),
			cell: ({ row }) =>
				renderComponent(Statuses, {
					status: REQUISITION_BADGE[row.original.status],
					label: REQUISITION_STATUS_LABELS[row.original.status]
				})
		}
	];
</script>

<svelte:head>
	<title>{m.purchasing_requisitions_title()}</title>
</svelte:head>

<div class="flex flex-col gap-4">
	<div class="flex flex-wrap items-center justify-between gap-2">
		<div>
			<h1 class="text-2xl font-semibold">{m.purchasing_requisitions_title()}</h1>
			<p class="text-muted-foreground">
				{m.purchasing_requisitions_intro()}
				{#if data.waiting}<strong>{m.purchasing_n_waiting_approval({ n: data.waiting })}</strong
					>{/if}
				{#if data.toIssue}<strong>{m.purchasing_n_to_issue({ n: data.toIssue })}</strong>{/if}
			</p>
		</div>
		{#if data.canRequest}
			<DialogComp
				bind:open
				title={m.purchasing_new_requisition()}
				variant="default"
				IconComp={Plus}
			>
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
						{#if $delayed}<LoadingBtn
								name={m.purchasing_creating()}
							/>{:else}{m.purchasing_create_draft()}{/if}
					</Button>
				</form>
			</DialogComp>
		{/if}
	</div>

	<DataTable
		data={data.requisitions}
		{columns}
		fileName={m.purchasing_requisitions_title()}
		facetKeys={['status', 'department']}
	/>
</div>
