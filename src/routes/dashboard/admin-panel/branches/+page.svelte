<script lang="ts">
	import { m } from '$lib/paraglide/messages.js';
	import SettingsLookup from '../SettingsLookup.svelte';
	import { add, edit } from './schema';

	let { data } = $props();
</script>

<SettingsLookup
	{data}
	schemas={{ add, edit }}
	config={{
		entity: m.admin_branch_entity(),
		plural: m.admin_branch_plural(),
		fields: [
			{ name: 'name', label: m.common_name(), type: 'text' },
			{
				name: 'code',
				label: m.admin_branch_code(),
				type: 'text',
				placeholder: m.admin_branch_code_placeholder()
			},
			{ name: 'phone', label: m.common_phone(), type: 'text', required: false },
			{ name: 'address', label: m.common_address(), type: 'text', required: false, long: true },
			{ name: 'status', label: m.common_status(), type: 'boolean' }
		]
	}}
/>
