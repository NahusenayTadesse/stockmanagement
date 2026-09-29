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
		entity: m.admin_cat_entity(),
		plural: m.admin_cat_plural(),
		fields: [
			{ name: 'name', label: m.common_name(), type: 'text' },
			{ name: 'nameAm', label: m.admin_cat_name_am(), type: 'text', required: false },
			{
				name: 'expiryWarningDays',
				label: m.admin_cat_warning_days(),
				type: 'number',
				placeholder: m.admin_cat_warning_placeholder()
			},
			{
				name: 'minShelfLifeDays',
				label: m.admin_cat_min_shelf(),
				type: 'number',
				required: false,
				placeholder: m.admin_cat_min_shelf_placeholder()
			},
			{
				name: 'refuseShortShelfLife',
				label: m.admin_cat_shorter(),
				type: 'boolean',
				trueLabel: m.admin_cat_refuse(),
				falseLabel: m.admin_cat_flag()
			},
			{ name: 'status', label: m.common_status(), type: 'boolean' }
		]
	}}
/>
