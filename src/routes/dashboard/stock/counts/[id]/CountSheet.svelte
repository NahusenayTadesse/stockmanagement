<script lang="ts">
	import { enhance } from '$app/forms';
	import Save from '@lucide/svelte/icons/save';
	import type { ColumnDef } from '@tanstack/table-core';
	import DataTable from '@nahu/admin-kit/components/Table/data-table.svelte';
	import { renderSnippet } from '@nahu/admin-kit/components/ui/data-table/index.js';
	import { Button } from '@nahu/admin-kit/components/ui/button/index.js';
	import { formatETB } from '@nahu/admin-kit/global';
	import { qty } from '$lib/format';
	import { m } from '$lib/paraglide/messages.js';

	/**
	 * The count sheet: one box per line for what was counted, and — unless the count is blind —
	 * what the books expected and the difference. Every line shown is submitted, so no pages.
	 */
	type Line = {
		id: number;
		item: string;
		sku: string | null;
		added: boolean;
		unit: string;
		lotNumber: string | null;
		expiryDate: string | null;
		expected: number | null;
		counted: number | null;
		variance: number | null;
		varianceValue: number | null;
	};
	let {
		lines,
		editable,
		showExpected
	}: {
		lines: Line[];
		editable: boolean;
		showExpected: boolean;
	} = $props();

	let saving = $state(false);

	const columns = $derived<ColumnDef<Line>[]>([
		{
			accessorKey: 'item',
			header: m.common_item(),
			cell: ({ row }) => renderSnippet(itemCell, row.original)
		},
		{
			accessorKey: 'lotNumber',
			header: m.stock_col_lot(),
			cell: ({ row }) =>
				`${row.original.lotNumber ?? '—'}${row.original.expiryDate ? m.stock_exp_suffix({ date: row.original.expiryDate }) : ''}`
		},
		...(showExpected
			? [
					{
						accessorKey: 'expected',
						meta: { align: 'right' },
						header: m.stock_expected(),
						cell: ({ row }) => qty(row.original.expected, row.original.unit)
					} satisfies ColumnDef<Line>
				]
			: []),
		{
			accessorKey: 'counted',
			header: m.stock_counted(),
			cell: ({ row }) => renderSnippet(countedCell, row.original)
		},
		...(showExpected
			? [
					{
						accessorKey: 'variance',
						header: m.stock_difference(),
						cell: ({ row }) => renderSnippet(varianceCell, row.original)
					} satisfies ColumnDef<Line>,
					{
						accessorKey: 'varianceValue',
						meta: { align: 'right' },
						header: m.stock_col_value(),
						cell: ({ row }) =>
							row.original.varianceValue ? formatETB(row.original.varianceValue) : ''
					} satisfies ColumnDef<Line>
				]
			: [])
	]);
</script>

{#snippet itemCell(line: Line)}
	<p class="font-medium">{line.item}</p>
	<p class="text-xs text-muted-foreground">
		{line.sku}{line.added ? m.stock_found_during_count() : ''}
	</p>
{/snippet}

{#snippet countedCell(line: Line)}
	{#if editable}
		<input
			name="counted_{line.id}"
			type="number"
			min="0"
			step="any"
			inputmode="decimal"
			value={line.counted ?? ''}
			aria-label={m.stock_counted_aria({ item: line.item, lot: line.lotNumber ?? '' })}
			class="h-9 w-28 rounded-md border bg-background px-2 text-right"
		/>
		<span class="ml-1 text-xs text-muted-foreground">{line.unit}</span>
	{:else}
		{qty(line.counted, line.unit)}
	{/if}
{/snippet}

{#snippet varianceCell(line: Line)}
	<span class="font-medium {line.variance && line.variance < 0 ? 'text-destructive' : ''}">
		{line.variance === null
			? ''
			: line.variance > 0
				? `+${qty(line.variance)}`
				: qty(line.variance)}
	</span>
{/snippet}

<form
	method="POST"
	action="?/save"
	use:enhance={() => {
		saving = true;
		return async ({ update }) => {
			await update({ reset: false });
			saving = false;
		};
	}}
	class="flex flex-col gap-3"
>
	{#if lines.length}
		<DataTable
			variant="sheet"
			data={lines}
			{columns}
			rowClass={(line) => (line.variance ? 'bg-amber-500/5' : null)}
		/>
	{:else}
		<p class="rounded-md border px-3 py-6 text-center text-sm text-muted-foreground">
			{m.stock_nothing_to_count()}
		</p>
	{/if}
	{#if editable}
		<Button type="submit" class="self-start" disabled={saving}
			><Save /> {saving ? `${m.common_saving()}…` : m.stock_save_counts()}</Button
		>
	{/if}
</form>
