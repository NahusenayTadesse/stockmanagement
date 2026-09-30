<script lang="ts">
	import PageSection from '@nahu/admin-kit/components/PageSection.svelte';
	import { m } from '$lib/paraglide/messages.js';
	import { resolve } from '$app/paths';
	import SettingsLookup from '$lib/components/SettingsLookup.svelte';
	import { add, edit } from './schema';

	let { data } = $props();
	const lists = $derived(data.rows as { id: number; name: string }[]);
</script>

<SettingsLookup
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
>
	{#if lists.length}
		<PageSection title={m.admin_pl_prices()} hint={m.admin_pl_prices_intro()}>
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
		</PageSection>
	{/if}
</SettingsLookup>
