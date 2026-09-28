<script lang="ts">
	import LookupPage from '@nahu/admin-kit/components/lookup/LookupPage.svelte';
	import { add, edit } from './schema';

	let { data } = $props();
</script>

<LookupPage
	{data}
	schemas={{ add, edit }}
	config={{
		entity: 'Branch',
		plural: 'Branches',
		fields: [
			{ name: 'name', label: 'Name', type: 'text' },
			{
				name: 'code',
				label: 'Code',
				type: 'text',
				placeholder: 'e.g. ADD — starts every document number from this branch'
			},
			{ name: 'phone', label: 'Phone', type: 'text', required: false },
			{ name: 'address', label: 'Address', type: 'text', required: false },
			{ name: 'status', label: 'Status', type: 'boolean' }
		]
	}}
/>
