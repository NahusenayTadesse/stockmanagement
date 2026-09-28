<script lang="ts">
	import LookupPage from '@nahu/admin-kit/components/lookup/LookupPage.svelte';
	import { LOCATION_KINDS } from '$lib/format';
	import { add, edit } from './schema';

	let { data } = $props();
</script>

<LookupPage
	{data}
	schemas={{ add, edit }}
	config={{
		entity: 'Location',
		plural: 'Locations',
		fields: [
			{
				name: 'name',
				label: 'Name',
				type: 'text',
				placeholder: 'Main store, Shop floor, Fridge 1…'
			},
			{
				name: 'branchId',
				label: 'Branch',
				type: 'reference',
				options: 'branchList',
				display: 'branch',
				picker: 'select'
			},
			{ name: 'kind', label: 'Kind', type: 'select', choices: LOCATION_KINDS },
			{ name: 'status', label: 'Status', type: 'boolean' }
		]
	}}
/>
