<script lang="ts">
	import { m } from '$lib/paraglide/messages.js';
	import PageHeader from '@nahu/admin-kit/components/PageHeader.svelte';
	import LookupSection from '@nahu/admin-kit/components/lookup/LookupSection.svelte';
	import { itemAdd, itemEdit } from '../schema';

	let { data } = $props();
</script>

<div class="flex flex-col gap-4">
	<PageHeader
		title={data.list.name}
		eyebrow={m.admin_pl_entity()}
		tabTitle={m.admin_pl_title({ name: data.list.name })}
		description={m.admin_pl_intro()}
	/>
	<LookupSection
		config={{
			entity: m.admin_pl_price_entity(),
			plural: m.admin_pl_price_plural(),
			fields: [
				{
					name: 'itemId',
					label: m.common_item(),
					type: 'reference',
					options: 'items',
					display: 'item'
				},
				{
					name: 'uomId',
					label: m.common_unit(),
					type: 'reference',
					options: 'units',
					display: 'unit',
					picker: 'select',
					required: false
				},
				{ name: 'price', label: m.common_price(), type: 'money' }
			]
		}}
		rows={data.prices.rows}
		addForm={data.prices.addForm}
		editForm={data.prices.editForm}
		canDelete
		options={{ itemId: data.items, uomId: data.units }}
		actions={{ add: '?/addPrice', edit: '?/editPrice', delete: '?/deletePrice' }}
		schemas={{ add: itemAdd, edit: itemEdit }}
	/>
</div>
