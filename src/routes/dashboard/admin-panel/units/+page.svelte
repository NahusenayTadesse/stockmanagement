<script lang="ts">
	import { m } from '$lib/paraglide/messages.js';
	import LookupPage from '@nahu/admin-kit/components/lookup/LookupPage.svelte';
	import { add, edit } from './schema';

	let { data } = $props();
</script>

<LookupPage
	{data}
	schemas={{ add, edit }}
	config={{
		entity: m.admin_units_entity(),
		plural: m.admin_units_plural(),
		fields: [
			{ name: 'name', label: m.common_name(), type: 'text' },
			{
				name: 'symbol',
				label: m.admin_units_symbol(),
				type: 'text',
				placeholder: m.admin_units_symbol_placeholder()
			},
			{ name: 'status', label: m.common_status(), type: 'boolean' }
		]
	}}
/>
