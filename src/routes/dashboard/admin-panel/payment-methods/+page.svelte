<script lang="ts">
	import LookupPage from '@nahu/admin-kit/components/lookup/LookupPage.svelte';
	import { PAYMENT_KIND_CHOICES } from '$lib/schemas/transactions';
	import { add, edit } from './schema';

	let { data } = $props();
</script>

<LookupPage
	{data}
	schemas={{ add, edit }}
	config={{
		entity: 'Payment method',
		plural: 'Payment methods',
		fields: [
			{
				name: 'name',
				label: 'Name',
				type: 'text',
				placeholder: 'Telebirr, Awash Bank, Cash till 2…'
			},
			{ name: 'kind', label: 'Kind', type: 'select', choices: PAYMENT_KIND_CHOICES },
			{
				name: 'accountNumber',
				label: 'Your account / wallet number',
				type: 'text',
				required: false,
				placeholder: 'For matching statements'
			},
			{ name: 'status', label: 'Status', type: 'boolean' }
		]
	}}
/>
