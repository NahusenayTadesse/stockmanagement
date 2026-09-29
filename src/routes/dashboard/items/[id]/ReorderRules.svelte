<script lang="ts">
	import { m } from '$lib/paraglide/messages.js';
	import { enhance } from '$app/forms';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import { Button } from '@nahu/admin-kit/components/ui/button/index.js';
	import { Input } from '@nahu/admin-kit/components/ui/input/index.js';
	import { qty } from '$lib/format';
	import type { ColumnDef } from '@tanstack/table-core';
	import DataTable from '@nahu/admin-kit/components/Table/data-table.svelte';
	import { renderSnippet } from '@nahu/admin-kit/components/ui/data-table/index.js';

	/**
	 * An item's minimum and maximum per location. At or below the minimum, the reorder screen
	 * suggests ordering up to the maximum. Saving a location that already has levels changes them.
	 */
	type Rule = {
		id: number;
		locationId: number;
		location: string;
		branch: string;
		minQuantity: number;
		maxQuantity: number | null;
	};
	let {
		rules,
		locations,
		unit,
		readonly = false
	}: {
		rules: Rule[];
		locations: { value: number; name: string }[];
		unit: string | undefined;
		readonly?: boolean;
	} = $props();

	const columns = $derived<ColumnDef<Rule>[]>([
		{
			accessorKey: 'location',
			header: m.common_location(),
			cell: ({ row }) => `${row.original.branch} · ${row.original.location}`
		},
		{
			accessorKey: 'minQuantity',
			meta: { align: 'right' },
			header: m.stock_minimum(),
			cell: ({ row }) => qty(row.original.minQuantity, unit ?? '')
		},
		{
			accessorKey: 'maxQuantity',
			meta: { align: 'right' },
			header: m.stock_maximum(),
			cell: ({ row }) =>
				row.original.maxQuantity === null
					? m.stock_twice_minimum()
					: qty(row.original.maxQuantity, unit ?? '')
		},
		...(readonly
			? []
			: [
					{
						id: 'remove',
						header: m.stock_remove(),
						cell: ({ row }) => renderSnippet(removeCell, row.original)
					} satisfies ColumnDef<Rule>
				])
	]);
</script>

{#snippet removeCell(r: Rule)}
	<form method="POST" action="?/deleteRule" use:enhance>
		<input type="hidden" name="id" value={r.id} />
		<Button
			type="submit"
			variant="ghost"
			size="icon"
			aria-label={m.stock_remove_levels_at({ location: r.location })}><Trash2 /></Button
		>
	</form>
{/snippet}

{#if rules.length}
	<DataTable variant="compact" data={rules} {columns} />
{:else}
	<p class="text-muted-foreground">
		{m.stock_no_levels()}
	</p>
{/if}

{#if !readonly && locations.length}
	<form
		method="POST"
		action="?/saveRule"
		use:enhance
		class="flex flex-wrap items-end gap-2 rounded-md border p-3"
	>
		<label class="flex flex-col gap-1 text-sm">
			{m.common_location()}
			<select name="locationId" class="h-9 rounded-md border bg-background px-2" required>
				{#each locations as l (l.value)}
					<option value={l.value}>{l.name}</option>
				{/each}
			</select>
		</label>
		<label class="flex flex-col gap-1 text-sm">
			{m.stock_minimum_unit({ unit: unit ?? m.stock_base_units() })}
			<Input name="minQuantity" type="number" min="0" step="any" required class="w-32" />
		</label>
		<label class="flex flex-col gap-1 text-sm">
			{m.stock_maximum_optional()}
			<Input name="maxQuantity" type="number" min="0" step="any" class="w-32" />
		</label>
		<Button type="submit" variant="outline">{m.stock_save_levels()}</Button>
	</form>
{/if}
