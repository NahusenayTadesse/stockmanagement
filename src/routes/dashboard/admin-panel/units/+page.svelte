<script lang="ts">
	import LookupPage from '@nahu/admin-kit/components/lookup/LookupPage.svelte';
	import { add, edit } from './schema';

	let { data } = $props();
</script>

<LookupPage
	{data}
	schemas={{ add, edit }}
	config={{
		entity: 'Unit',
		plural: 'Units of Measure',
		fields: [
			{ name: 'name', label: 'Name', type: 'text' },
			{ name: 'symbol', label: 'Symbol', type: 'text', placeholder: 'pcs, kg, qt, box…' },
			{ name: 'status', label: 'Status', type: 'boolean' }
		]
	}}
/>
