<script lang="ts">
	import Plus from '@lucide/svelte/icons/plus';
	import type { ColumnDef } from '@tanstack/table-core';
	import DataTable from '@nahu/admin-kit/components/Table/data-table.svelte';
	import DataTableLinks from '@nahu/admin-kit/components/Table/data-table-links.svelte';
	import Statuses from '@nahu/admin-kit/components/Table/statuses.svelte';
	import { renderComponent } from '@nahu/admin-kit/components/ui/data-table/index.js';
	import { Button } from '@nahu/admin-kit/components/ui/button/index.js';
	import DialogComp from '@nahu/admin-kit/formComponents/DialogComp.svelte';
	import InputComp from '@nahu/admin-kit/formComponents/InputComp.svelte';
	import LoadingBtn from '@nahu/admin-kit/formComponents/LoadingBtn.svelte';
	import Errors from '@nahu/admin-kit/formComponents/Errors.svelte';
	import { createForm } from '@nahu/admin-kit/forms/createForm';
	import { ethiopianDate } from '@nahu/admin-kit/tableCells';
	import { countOpen } from '$lib/schemas/counts';

	let { data } = $props();
	let open = $state(false);

	// svelte-ignore state_referenced_locally
	const { form, errors, enhance, delayed, allErrors } = createForm(data.form, countOpen);

	type Row = (typeof data.counts)[number];
	const STATUS_WORD = { open: 'pending', posted: 'confirmed', cancelled: 'cancelled' } as const;

	const columns: ColumnDef<Row>[] = [
		{
			accessorKey: 'id',
			header: 'Count',
			cell: ({ row }) =>
				renderComponent(DataTableLinks, {
					id: row.original.id,
					name: `Count #${row.original.id}`,
					entity: 'count'
				})
		},
		{ accessorKey: 'countDate', header: 'Date', cell: (info) => ethiopianDate(info.getValue()) },
		{ accessorKey: 'location', header: 'Location' },
		{
			accessorKey: 'category',
			header: 'Category',
			cell: (info) => info.getValue() ?? 'Everything'
		},
		{
			accessorKey: 'counted',
			header: 'Counted',
			cell: ({ row }) => `${row.original.counted} / ${row.original.lines}`
		},
		{ accessorKey: 'differences', header: 'Differences' },
		{
			accessorKey: 'adjustment',
			header: 'Adjustment',
			cell: ({ row }) =>
				row.original.adjustmentId
					? renderComponent(DataTableLinks, {
							id: row.original.adjustmentId,
							name: row.original.adjustment ?? '—',
							entity: 'document'
						})
					: row.original.status === 'posted'
						? 'None needed'
						: ''
		},
		{
			accessorKey: 'status',
			header: 'Status',
			cell: ({ row }) => renderComponent(Statuses, { status: STATUS_WORD[row.original.status] })
		},
		{ accessorKey: 'openedBy', header: 'Opened by', cell: (info) => info.getValue() ?? '' }
	];
</script>

<svelte:head>
	<title>Stock counts</title>
</svelte:head>

<div class="flex flex-col gap-4">
	<div class="flex flex-wrap items-center justify-between gap-2">
		<div>
			<h1 class="text-2xl font-semibold">Stock counts</h1>
			<p class="text-muted-foreground">
				Count a location, and post the differences as one adjustment. Serial-tracked items are
				checked by serial number instead.
			</p>
		</div>
		{#if data.canCount}
			<DialogComp bind:open title="Start a count" variant="default" IconComp={Plus}>
				<form method="POST" action="?/open" use:enhance id="open-count" class="flex flex-col gap-4">
					<Errors allErrors={$allErrors} />
					<InputComp
						{form}
						{errors}
						name="locationId"
						type="combo"
						label="Location"
						items={data.locations}
						required
					/>
					<InputComp
						{form}
						{errors}
						name="categoryId"
						type="select"
						label="Count"
						items={data.categories}
					/>
					<InputComp {form} {errors} name="countDate" type="date" label="Date" year required />
					<InputComp
						{form}
						{errors}
						name="blind"
						type="checkboxSingle"
						label="Blind count"
						placeholder="Hide the expected quantities from the counters"
					/>
					<InputComp
						{form}
						{errors}
						name="note"
						label="Note"
						placeholder="Who is counting, anything unusual"
					/>
					<Button type="submit" form="open-count">
						{#if $delayed}<LoadingBtn name="Taking the snapshot" />{:else}Start count{/if}
					</Button>
				</form>
			</DialogComp>
		{/if}
	</div>

	<DataTable data={data.counts} {columns} fileName="Stock counts" />
</div>
