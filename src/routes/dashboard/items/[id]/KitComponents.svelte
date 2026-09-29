<script lang="ts">
	import { m } from '$lib/paraglide/messages.js';
	import type { SuperValidated } from 'sveltekit-superforms';
	import LookupSection from '@nahu/admin-kit/components/lookup/LookupSection.svelte';
	import type { LookupRow } from '@nahu/admin-kit/components/lookup/types';
	import { formatETB } from '@nahu/admin-kit/global';
	import { componentAdd, componentEdit } from '$lib/schemas/items';
	import { qty } from '$lib/format';

	/**
	 * What one of this kit or recipe is made of. Selling the kit takes these off the shelf; what they
	 * cost at average cost is what the kit costs.
	 */
	let {
		kit,
		unitList,
		salePrice,
		unit = undefined,
		readonly
	}: {
		kit: {
			rows: LookupRow[];
			addForm: SuperValidated<Record<string, unknown>>;
			editForm: SuperValidated<Record<string, unknown>>;
			componentList: { value: number; name: string }[];
			cost: number;
			margin: number | null;
			makes: number | null;
		};
		unitList: { value: number; name: string }[];
		salePrice: number | null;
		/** The kit's own unit, "one" of which the components make. */
		unit?: string;
		readonly: boolean;
	} = $props();

	const options = $derived({
		componentItemId: kit.componentList,
		uomId: [{ value: 0, name: m.stock_component_base_unit() }, ...unitList]
	});
</script>

<div class="flex flex-col gap-3">
	<LookupSection
		config={{
			entity: m.stock_component(),
			plural: m.stock_components(),
			fields: [
				{
					name: 'componentItemId',
					label: m.common_item(),
					type: 'reference',
					options: 'componentList',
					display: 'component'
				},
				{
					name: 'quantity',
					label: m.stock_how_many_in_one({ unit: unit ?? '' }).trim(),
					type: 'number'
				},
				{
					name: 'uomId',
					label: m.stock_unit(),
					type: 'reference',
					options: 'unitList',
					display: 'unit',
					picker: 'select',
					required: false
				}
			],
			extraColumns: [
				{
					accessorKey: 'cost',
					header: m.stock_cost(),
					cell: ({ row }) => formatETB(Number(row.original.cost ?? 0))
				},
				{
					accessorKey: 'onHand',
					header: m.stock_on_hand(),
					cell: ({ row }) => qty(Number(row.original.onHand ?? 0))
				}
			]
		}}
		rows={kit.rows}
		addForm={kit.addForm}
		editForm={kit.editForm}
		canDelete={!readonly}
		{options}
		actions={{ add: '?/addComponent', edit: '?/editComponent', delete: '?/deleteComponent' }}
		schemas={{ add: componentAdd, edit: componentEdit }}
		{readonly}
	/>
	<dl class="grid grid-cols-3 gap-2 text-sm">
		<div>
			<dt class="text-muted-foreground">{m.stock_components_cost()}</dt>
			<dd class="font-medium">{formatETB(kit.cost)}</dd>
		</div>
		<div>
			<dt class="text-muted-foreground">{m.stock_margin_list()}</dt>
			<dd class="font-medium" class:text-destructive={kit.margin !== null && kit.margin < 0}>
				{kit.margin === null ? m.stock_no_sale_price() : formatETB(kit.margin)}
				{#if kit.margin !== null && salePrice}
					<span class="text-muted-foreground">({Math.round((kit.margin / salePrice) * 100)}%)</span>
				{/if}
			</dd>
		</div>
		<div>
			<dt class="text-muted-foreground">{m.stock_could_make()}</dt>
			<dd class="font-medium">{kit.makes === null ? m.stock_no_limit_services() : kit.makes}</dd>
		</div>
	</dl>
</div>
