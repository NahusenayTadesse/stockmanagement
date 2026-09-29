<script lang="ts">
	import { m } from '$lib/paraglide/messages.js';
	import LookupSection from '@nahu/admin-kit/components/lookup/LookupSection.svelte';
	import { itemAdd, itemEdit } from '../schema';

	let { data } = $props();
</script>

<svelte:head>
	<title>{m.admin_pl_title({ name: data.list.name })}</title>
</svelte:head>

<div class="flex flex-col gap-4">
	<div>
		<p class="text-sm text-muted-foreground">{m.admin_pl_entity()}</p>
		<h1 class="text-2xl font-semibold">{data.list.name}</h1>
		<p class="text-muted-foreground">
			{m.admin_pl_intro()}
		</p>
	</div>
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
