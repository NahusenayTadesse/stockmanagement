<script lang="ts">
	import { m } from '$lib/paraglide/messages.js';
	import SettingsLookup from '$lib/components/SettingsLookup.svelte';
	import { PAYMENT_KIND_CHOICES } from '$lib/schemas/transactions';
	import { add, edit } from './schema';

	let { data } = $props();
</script>

<SettingsLookup
	{data}
	schemas={{ add, edit }}
	config={{
		entity: m.admin_pm_entity(),
		plural: m.admin_pm_plural(),
		fields: [
			{
				name: 'name',
				label: m.common_name(),
				type: 'text',
				placeholder: m.admin_pm_name_placeholder()
			},
			{ name: 'kind', label: m.admin_pm_kind(), type: 'select', choices: PAYMENT_KIND_CHOICES },
			{
				name: 'accountNumber',
				label: m.admin_pm_account(),
				type: 'text',
				required: false,
				placeholder: m.admin_pm_account_placeholder()
			},
			{ name: 'status', label: m.common_status(), type: 'boolean' }
		]
	}}
/>
