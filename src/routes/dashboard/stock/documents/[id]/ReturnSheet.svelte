<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ColumnDef } from '@tanstack/table-core';
	import DataTable from '@nahu/admin-kit/components/Table/data-table.svelte';
	import { renderSnippet } from '@nahu/admin-kit/components/ui/data-table/index.js';
	import { Button } from '@nahu/admin-kit/components/ui/button/index.js';
	import { moneyCell } from '$lib/table';
	import { m } from '$lib/paraglide/messages.js';

	/**
	 * A draft return: what is coming back on each line of the original — a quantity, or which
	 * serials — against what is still returnable, at the original price or cost.
	 */
	type Line = {
		id: number;
		item: string;
		unit: string;
		lot: string;
		quantity: number;
		serials: string;
		left: number;
		price: number | null;
		gross: number;
	};
	let {
		lines,
		editable,
		isSale
	}: {
		lines: Line[];
		editable: boolean;
		/** A customer return (prices) rather than a return to supplier (costs). */
		isSale: boolean;
	} = $props();

	const columns = $derived<ColumnDef<Line>[]>([
		{ accessorKey: 'item', header: m.common_item() },
		{ accessorKey: 'lot', header: m.stock_col_lot(), cell: (info) => info.getValue() || '—' },
		{
			id: 'returning',
			header: m.stock_returning(),
			cell: ({ row }) => renderSnippet(returningCell, row.original)
		},
		{
			accessorKey: 'left',
			header: m.stock_still_returnable(),
			cell: ({ row }) => `${row.original.left} ${row.original.unit}`
		},
		{
			accessorKey: 'price',
			meta: { align: 'right' },
			header: isSale ? m.common_price() : m.stock_cost(),
			cell: (info) => (info.getValue() == null ? '—' : moneyCell(info))
		},
		{ accessorKey: 'gross', header: m.stock_col_value(), cell: moneyCell, meta: { align: 'right' } }
	]);
</script>

{#snippet returningCell(r: Line)}
	{#if editable}
		{#if r.serials}
			<textarea
				name="serials_{r.id}"
				rows={Math.min(6, r.serials.split('\n').length)}
				aria-label={m.stock_serials_back_aria({ item: r.item })}
				class="w-48 rounded-md border bg-background px-2 py-1 font-mono text-xs"
				>{r.serials}</textarea
			>
		{:else}
			<input
				name="qty_{r.id}"
				type="number"
				min="0"
				max={r.left}
				step="any"
				value={r.quantity}
				aria-label={m.stock_qty_back_aria({ item: r.item })}
				class="h-9 w-24 rounded-md border bg-background px-2 text-right"
			/>
		{/if}
	{:else}
		{r.quantity}
	{/if}
	<span class="ml-1 text-xs text-muted-foreground">{r.unit}</span>
{/snippet}

<form
	method="POST"
	action="?/saveReturn"
	use:enhance={() =>
		async ({ update }) =>
			update({ reset: false })}
	class="flex flex-col gap-3"
>
	{#if lines.length}
		<DataTable variant="sheet" data={lines} {columns} />
	{:else}
		<p class="rounded-md border px-3 py-6 text-center text-sm text-muted-foreground">
			{m.stock_no_lines_left()}
		</p>
	{/if}
	{#if editable && lines.length}
		<Button type="submit" class="self-start" variant="outline">{m.stock_save_quantities()}</Button>
	{/if}
</form>
