<script lang="ts">
	import { m } from '$lib/paraglide/messages.js';
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
			entity: m.admin_pl_entity(),
			plural: m.admin_pl_plural(),
			fields: [
				{
					name: 'name',
					label: m.common_name(),
					type: 'text',
					placeholder: m.admin_pl_name_placeholder()
				},
				{ name: 'note', label: m.common_note(), type: 'text', required: false, long: true },
				{ name: 'status', label: m.common_status(), type: 'boolean' }
			]
		}}
	/>
	{#if lists.length}
		<section class="flex flex-col gap-2">
			<h2 class="text-lg font-semibold">{m.admin_pl_prices()}</h2>
			<p class="text-sm text-muted-foreground">
				{m.admin_pl_prices_intro()}
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
