<script lang="ts">
	import LookupSection from '@nahu/admin-kit/components/lookup/LookupSection.svelte';
	import { itemAdd, itemEdit } from '../schema';

	let { data } = $props();
</script>

<svelte:head>
	<title>{data.list.name} prices</title>
</svelte:head>

<div class="flex flex-col gap-4">
	<div>
		<p class="text-sm text-muted-foreground">Price list</p>
		<h1 class="text-2xl font-semibold">{data.list.name}</h1>
		<p class="text-muted-foreground">
			Prices before VAT. A price for the base unit also prices its packs (a box of 10 at ten times
			it) unless the pack has its own price here.
		</p>
	</div>
	<LookupSection
		config={{
			entity: 'Price',
			plural: 'Prices',
			fields: [
				{ name: 'itemId', label: 'Item', type: 'reference', options: 'items', display: 'item' },
				{
					name: 'uomId',
					label: 'Unit',
					type: 'reference',
					options: 'units',
					display: 'unit',
					picker: 'select',
					required: false
				},
				{ name: 'price', label: 'Price', type: 'money' }
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
