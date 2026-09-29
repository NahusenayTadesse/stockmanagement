<script lang="ts">
	import { m } from '$lib/paraglide/messages.js';
	import type { SuperValidated } from 'sveltekit-superforms';
	import { resolve } from '$app/paths';
	import { formatETB } from '@nahu/admin-kit/global';
	import { qty } from '$lib/format';
	import VariantForm from './VariantForm.svelte';

	/**
	 * An item's variants — the same shirt in red and in blue, each with its own code, barcode and
	 * stock — and "Add variant", which copies this item's settings under a new code and label.
	 */
	let {
		variants,
		form = undefined,
		unit = undefined
	}: {
		variants: {
			id: number;
			sku: string;
			name: string;
			variantLabel: string | null;
			salePrice: number | null;
			isActive: boolean;
			onHand: number;
		}[];
		/** Present when the viewer may add items. */
		form?: SuperValidated<Record<string, unknown>>;
		unit?: string;
	} = $props();
</script>

<div class="flex flex-col gap-3">
	{#if variants.length}
		<table class="w-full text-sm">
			<thead class="text-left text-muted-foreground">
				<tr>
					<th class="py-1 font-medium">{m.stock_f_variant()}</th>
					<th class="py-1 font-medium">{m.stock_col_code()}</th>
					<th class="py-1 text-right font-medium">{m.common_price()}</th>
					<th class="py-1 text-right font-medium">{m.stock_on_hand()}</th>
				</tr>
			</thead>
			<tbody>
				{#each variants as v (v.id)}
					<tr class="border-t" class:opacity-50={!v.isActive}>
						<td class="py-1">
							<a
								class="underline-offset-4 hover:underline"
								href={resolve('/dashboard/items/[id]', { id: String(v.id) })}
							>
								{v.variantLabel ?? v.name}
							</a>
						</td>
						<td class="py-1">{v.sku}</td>
						<td class="py-1 text-right">{v.salePrice == null ? '—' : formatETB(v.salePrice)}</td>
						<td class="py-1 text-right">{qty(v.onHand, unit)}</td>
					</tr>
				{/each}
			</tbody>
		</table>
	{:else}
		<p class="text-sm text-muted-foreground">
			{m.stock_no_variants()}
		</p>
	{/if}

	{#if form}
		<VariantForm data={form} />
	{/if}
</div>
