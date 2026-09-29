<script lang="ts">
	import { m } from '$lib/paraglide/messages.js';
	import type { SuperValidated } from 'sveltekit-superforms';
	import type { ColumnDef } from '@tanstack/table-core';
	import DataTable from '@nahu/admin-kit/components/Table/data-table.svelte';
	import DataTableLinks from '@nahu/admin-kit/components/Table/data-table-links.svelte';
	import { renderSnippet } from '@nahu/admin-kit/components/ui/data-table/index.js';
	import { qty } from '$lib/format';
	import { moneyCell } from '$lib/table';
	import VariantForm from './VariantForm.svelte';

	/**
	 * An item's variants — the same shirt in red and in blue, each with its own code, barcode and
	 * stock — and "Add variant", which copies this item's settings under a new code and label.
	 */
	type Variant = {
		id: number;
		sku: string;
		name: string;
		variantLabel: string | null;
		salePrice: number | null;
		isActive: boolean;
		onHand: number;
	};
	let {
		variants,
		form = undefined,
		unit = undefined
	}: {
		variants: Variant[];
		/** Present when the viewer may add items. */
		form?: SuperValidated<Record<string, unknown>>;
		unit?: string;
	} = $props();

	const columns = $derived<ColumnDef<Variant>[]>([
		{
			accessorKey: 'variantLabel',
			header: m.stock_f_variant(),
			cell: ({ row }) => renderSnippet(variantCell, row.original)
		},
		{ accessorKey: 'sku', header: m.stock_col_code() },
		{
			accessorKey: 'salePrice',
			meta: { align: 'right' },
			header: m.common_price(),
			cell: (info) => (info.getValue() == null ? '—' : moneyCell(info))
		},
		{
			accessorKey: 'onHand',
			meta: { align: 'right' },
			header: m.stock_on_hand(),
			cell: ({ row }) => qty(row.original.onHand, unit)
		}
	]);
</script>

{#snippet variantCell(v: Variant)}
	<span class:opacity-50={!v.isActive}>
		<DataTableLinks id={v.id} name={v.variantLabel ?? v.name} entity="item" />
	</span>
{/snippet}

<div class="flex flex-col gap-3">
	{#if variants.length}
		<DataTable variant="compact" data={variants} {columns} />
	{:else}
		<p class="text-sm text-muted-foreground">
			{m.stock_no_variants()}
		</p>
	{/if}

	{#if form}
		<VariantForm data={form} />
	{/if}
</div>
