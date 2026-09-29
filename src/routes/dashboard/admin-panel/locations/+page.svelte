<script lang="ts">
	import { m } from '$lib/paraglide/messages.js';
	import LookupPage from '@nahu/admin-kit/components/lookup/LookupPage.svelte';
	import { LOCATION_KINDS } from '$lib/format';
	import { add, edit } from './schema';

	let { data } = $props();
</script>

<LookupPage
	{data}
	schemas={{ add, edit }}
	config={{
		entity: m.admin_loc_entity(),
		plural: m.admin_loc_plural(),
		fields: [
			{
				name: 'name',
				label: m.common_name(),
				type: 'text',
				placeholder: m.admin_loc_name_placeholder()
			},
			{
				name: 'branchId',
				label: m.common_branch(),
				type: 'reference',
				options: 'branchList',
				display: 'branch',
				picker: 'select'
			},
			{ name: 'kind', label: m.admin_loc_kind(), type: 'select', choices: LOCATION_KINDS },
			{ name: 'status', label: m.common_status(), type: 'boolean' }
		]
	}}
/>
