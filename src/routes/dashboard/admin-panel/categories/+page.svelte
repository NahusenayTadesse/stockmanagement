<script lang="ts">
	import LookupPage from '@nahu/admin-kit/components/lookup/LookupPage.svelte';
	import { add, edit } from './schema';

	let { data } = $props();
</script>

<LookupPage
	{data}
	schemas={{ add, edit }}
	config={{
		entity: 'Category',
		plural: 'Categories',
		fields: [
			{ name: 'name', label: 'Name', type: 'text' },
			{ name: 'nameAm', label: 'Name (Amharic)', type: 'text', required: false },
			{
				name: 'expiryWarningDays',
				label: 'Expiry warning (days)',
				type: 'number',
				placeholder: 'How early a lot counts as expiring soon'
			},
			{ name: 'status', label: 'Status', type: 'boolean' }
		]
	}}
/>
