<script lang="ts">
	import SettingsLookup from '$lib/components/SettingsLookup.svelte';
	import { packageAdd, packageEdit } from '$lib/schemas/billing';
	import { m } from '$lib/paraglide/messages.js';

	let { data } = $props();
</script>

<SettingsLookup
	{data}
	schemas={{ add: packageAdd, edit: packageEdit }}
	description={m.platform_packages_intro()}
	config={{
		entity: m.billing_package(),
		plural: m.platform_nav_packages(),
		fields: [
			{ name: 'name', label: m.common_name(), type: 'text' },
			{
				name: 'slug',
				label: m.platform_pkg_slug(),
				type: 'text',
				placeholder: m.platform_pkg_slug_placeholder(),
				inTable: false
			},
			{
				name: 'description',
				label: m.platform_pkg_description(),
				type: 'text',
				required: false,
				long: 30
			},
			{ name: 'price', label: m.platform_pkg_price(), type: 'money' },
			{
				name: 'billingMonths',
				label: m.platform_pkg_months(),
				type: 'number',
				placeholder: m.platform_pkg_months_placeholder()
			},
			{
				name: 'maxUsers',
				label: m.platform_pkg_users(),
				type: 'number',
				required: false,
				placeholder: m.platform_pkg_no_limit()
			},
			{
				name: 'maxBranches',
				label: m.platform_pkg_branches(),
				type: 'number',
				required: false,
				placeholder: m.platform_pkg_no_limit()
			},
			{ name: 'trialDays', label: m.platform_pkg_trial(), type: 'number' },
			{
				name: 'highlights',
				label: m.platform_pkg_highlights(),
				type: 'textarea',
				required: false,
				rows: 4,
				placeholder: m.platform_pkg_highlights_placeholder(),
				inTable: false
			},
			{
				name: 'isFeatured',
				label: m.site_price_popular(),
				type: 'boolean',
				trueLabel: m.common_yes(),
				falseLabel: m.common_no()
			},
			{ name: 'sortOrder', label: m.platform_sort_order(), type: 'number', inTable: false },
			{ name: 'status', label: m.platform_pkg_on_sale(), type: 'boolean' }
		]
	}}
/>
