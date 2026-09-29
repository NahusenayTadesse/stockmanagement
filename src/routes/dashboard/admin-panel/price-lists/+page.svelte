<script lang="ts">
	import { resolve } from '$app/paths';
	import LookupPage from '@nahu/admin-kit/components/lookup/LookupPage.svelte';
	import { add, edit } from './schema';

	let { data } = $props();
	const lists = $derived(data.rows as { id: number; name: string }[]);
</script>

<div class="flex flex-col gap-6">
	<LookupPage
		{data}
		schemas={{ add, edit }}
		config={{
			entity: 'Price list',
			plural: 'Price lists',
			fields: [
				{ name: 'name', label: 'Name', type: 'text', placeholder: 'Wholesale, Contractors…' },
				{ name: 'note', label: 'Note', type: 'text', required: false },
				{ name: 'status', label: 'Status', type: 'boolean' }
			]
		}}
	/>
	{#if lists.length}
		<section class="flex flex-col gap-2">
			<h2 class="text-lg font-semibold">Prices</h2>
			<p class="text-sm text-muted-foreground">
				A customer on a list buys its items at the list's prices; anything not on it sells at the
				item's own price. Assign a list on the customer's page.
			</p>
			<ul class="flex flex-wrap gap-2">
				{#each lists as l (l.id)}
					<li>
						<a
							class="inline-block rounded-md border px-3 py-2 text-sm hover:bg-muted"
							href={resolve('/dashboard/admin-panel/price-lists/[id]', { id: String(l.id) })}
							>{l.name} →</a
						>
					</li>
				{/each}
			</ul>
		</section>
	{/if}
</div>
