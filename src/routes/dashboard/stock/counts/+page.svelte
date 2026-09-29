<script lang="ts">
	import { m } from '$lib/paraglide/messages.js';
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
			header: m.stock_count(),
			cell: ({ row }) =>
				renderComponent(DataTableLinks, {
					id: row.original.id,
					name: m.stock_count_number({ id: row.original.id }),
					entity: 'count'
				})
		},
		{
			accessorKey: 'countDate',
			header: m.common_date(),
			cell: (info) => ethiopianDate(info.getValue())
		},
		{ accessorKey: 'location', header: m.common_location() },
		{
			accessorKey: 'category',
			header: m.stock_col_category(),
			cell: (info) => info.getValue() ?? m.stock_everything()
		},
		{
			accessorKey: 'counted',
			header: m.stock_counted(),
			cell: ({ row }) => `${row.original.counted} / ${row.original.lines}`
		},
		{ accessorKey: 'differences', header: m.stock_differences() },
		{
			accessorKey: 'adjustment',
			header: m.stock_adjustment(),
			cell: ({ row }) =>
				row.original.adjustmentId
					? renderComponent(DataTableLinks, {
							id: row.original.adjustmentId,
							name: row.original.adjustment ?? '—',
							entity: 'document'
						})
					: row.original.status === 'posted'
						? m.stock_none_needed()
						: ''
		},
		{
			accessorKey: 'status',
			header: m.common_status(),
			cell: ({ row }) =>
				renderComponent(Statuses, {
					status: STATUS_WORD[row.original.status],
					label: {
						open: m.stock_count_status_open,
						posted: m.stock_count_status_posted,
						cancelled: m.stock_count_status_cancelled
					}[row.original.status]()
				})
		},
		{ accessorKey: 'openedBy', header: m.stock_opened_by(), cell: (info) => info.getValue() ?? '' }
	];
</script>

<svelte:head>
	<title>{m.stock_counts_title()}</title>
</svelte:head>

<div class="flex flex-col gap-4">
	<div class="flex flex-wrap items-center justify-between gap-2">
		<div>
			<h1 class="text-2xl font-semibold">{m.stock_counts_title()}</h1>
			<p class="text-muted-foreground">
				{m.stock_counts_intro()}
			</p>
		</div>
		{#if data.canCount}
			<DialogComp bind:open title={m.stock_start_a_count()} variant="default" IconComp={Plus}>
				<form method="POST" action="?/open" use:enhance id="open-count" class="flex flex-col gap-4">
					<Errors allErrors={$allErrors} />
					<InputComp
						{form}
						{errors}
						name="locationId"
						type="combo"
						label={m.common_location()}
						items={data.locations}
						required
					/>
					<InputComp
						{form}
						{errors}
						name="categoryId"
						type="select"
						label={m.stock_count()}
						items={data.categories}
					/>
					<InputComp
						{form}
						{errors}
						name="countDate"
						type="date"
						label={m.common_date()}
						year
						required
					/>
					<InputComp
						{form}
						{errors}
						name="blind"
						type="checkboxSingle"
						label={m.stock_blind_count()}
						placeholder={m.stock_blind_hint()}
					/>
					<InputComp
						{form}
						{errors}
						name="note"
						label={m.common_note()}
						placeholder={m.stock_count_note_placeholder()}
					/>
					<Button type="submit" form="open-count">
						{#if $delayed}<LoadingBtn
								name={m.stock_taking_snapshot()}
							/>{:else}{m.stock_start_count()}{/if}
					</Button>
				</form>
			</DialogComp>
		{/if}
	</div>

	<DataTable data={data.counts} {columns} fileName={m.stock_counts_title()} />
</div>
