<script lang="ts">
	import SettingsLookup from '$lib/components/SettingsLookup.svelte';
	import { bankAccountAdd, bankAccountEdit } from '$lib/schemas/billing';
	import { m } from '$lib/paraglide/messages.js';

	let { data } = $props();
</script>

<SettingsLookup
	{data}
	schemas={{ add: bankAccountAdd, edit: bankAccountEdit }}
	description={m.platform_bank_intro()}
	config={{
		entity: m.platform_bank_account(),
		plural: m.platform_nav_bank_accounts(),
		fields: [
			{
				name: 'bankName',
				label: m.platform_bank_name(),
				type: 'text',
				placeholder: m.platform_bank_name_placeholder()
			},
			{ name: 'accountName', label: m.platform_bank_holder(), type: 'text' },
			{ name: 'accountNumber', label: m.platform_bank_number(), type: 'text' },
			{ name: 'sortOrder', label: m.platform_sort_order(), type: 'number', inTable: false },
			{ name: 'status', label: m.common_status(), type: 'boolean' }
		]
	}}
/>
