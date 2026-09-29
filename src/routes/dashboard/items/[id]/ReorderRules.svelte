<script lang="ts">
	import { m } from '$lib/paraglide/messages.js';
	import { enhance } from '$app/forms';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import { Button } from '@nahu/admin-kit/components/ui/button/index.js';
	import { Input } from '@nahu/admin-kit/components/ui/input/index.js';
	import { qty } from '$lib/format';

	/**
	 * An item's minimum and maximum per location. At or below the minimum, the reorder screen
	 * suggests ordering up to the maximum. Saving a location that already has levels changes them.
	 */
	let {
		rules,
		locations,
		unit,
		readonly = false
	}: {
		rules: {
			id: number;
			locationId: number;
			location: string;
			branch: string;
			minQuantity: number;
			maxQuantity: number | null;
		}[];
		locations: { value: number; name: string }[];
		unit: string | undefined;
		readonly?: boolean;
	} = $props();
</script>

{#if rules.length}
	<div class="overflow-x-auto rounded-md border">
		<table class="w-full text-sm">
			<thead class="bg-muted/50 text-left">
				<tr>
					<th class="px-3 py-2">{m.common_location()}</th>
					<th class="px-3 py-2 text-right">{m.stock_minimum()}</th>
					<th class="px-3 py-2 text-right">{m.stock_maximum()}</th>
					{#if !readonly}<th class="w-10 px-3 py-2"
							><span class="sr-only">{m.stock_remove()}</span></th
						>{/if}
				</tr>
			</thead>
			<tbody>
				{#each rules as r (r.id)}
					<tr class="border-t">
						<td class="px-3 py-2">{r.branch} · {r.location}</td>
						<td class="px-3 py-2 text-right">{qty(r.minQuantity, unit ?? '')}</td>
						<td class="px-3 py-2 text-right">
							{r.maxQuantity === null ? m.stock_twice_minimum() : qty(r.maxQuantity, unit ?? '')}
						</td>
						{#if !readonly}
							<td class="px-3 py-2">
								<form method="POST" action="?/deleteRule" use:enhance>
									<input type="hidden" name="id" value={r.id} />
									<Button
										type="submit"
										variant="ghost"
										size="icon"
										aria-label={m.stock_remove_levels_at({ location: r.location })}
										><Trash2 /></Button
									>
								</form>
							</td>
						{/if}
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
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
