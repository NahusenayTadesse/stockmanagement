<script lang="ts">
	import LookupSection from '@nahu/admin-kit/components/lookup/LookupSection.svelte';
	import type { LookupField } from '@nahu/admin-kit/components/lookup/types';
	import { itemAdd, itemEdit, STORAGE_CHOICES } from '$lib/schemas/items';
	import { extraColumns } from './columns';
	import { invalidateAll } from '$app/navigation';
	import { toast } from 'svelte-sonner';
	import QuickSupplier from '$lib/components/QuickSupplier.svelte';

	let { data } = $props();

	const flag = (name: string, label: string): LookupField => ({
		name,
		label,
		type: 'checkbox',
		required: false,
		inTable: false,
		trueLabel: 'Yes',
		falseLabel: 'No'
	});

	const fields: LookupField[] = [
		{ name: 'name', label: 'Name', type: 'text' },
		{ name: 'sku', label: 'Code / SKU', type: 'text' },
		{ name: 'nameAm', label: 'Name (Amharic)', type: 'text', required: false, inTable: false },
		{
			name: 'categoryId',
			label: 'Category',
			type: 'reference',
			options: 'categoryList',
			display: 'category',
			required: false
		},
		{
			name: 'supplierId',
			label: 'Main supplier',
			type: 'reference',
			options: 'supplierList',
			display: 'supplier',
			// The server insists for stock-tracked items; services may leave it empty.
			required: false
		},
		{
			name: 'baseUomId',
			label: 'Counted in',
			type: 'reference',
			options: 'unitList',
			display: 'unit'
		},
		{ name: 'salePrice', label: 'Sale price', type: 'money', required: false },
		{
			name: 'reorderLevel',
			label: 'Reorder at (base units)',
			type: 'number',
			required: false,
			inTable: false
		},
		{
			name: 'storageCondition',
			label: 'Storage',
			type: 'select',
			choices: STORAGE_CHOICES,
			inTable: false
		},
		flag('stockTracked', 'Counted in stock (untick for services)'),
		flag('trackLots', 'Track lot / batch numbers'),
		flag('trackExpiry', 'Track expiry dates (FEFO; expired lots are blocked)'),
		flag('trackSerials', 'Track serial numbers'),
		flag('sellable', 'Sold'),
		flag('purchasable', 'Bought'),
		flag('leasable', 'Rented out'),
		flag('consumable', 'Used internally'),
		flag('perishable', 'Perishable'),
		flag('prescriptionOnly', 'Prescription only'),
		flag('controlledSubstance', 'Controlled substance (narcotic / psychotropic)'),
		{
			name: 'description',
			label: 'Description',
			type: 'textarea',
			rows: 3,
			required: false,
			inTable: false
		},
		{ name: 'status', label: 'Status', type: 'boolean' }
	];

	const options = $derived({
		categoryId: data.categoryList,
		baseUomId: data.unitList,
		supplierId: data.supplierList
	});
</script>

<svelte:head>
	<title>Items</title>
</svelte:head>

<div class="flex flex-col gap-4">
	<div>
		<h1 class="text-2xl font-semibold">Items ({data.rows.length})</h1>
		<p class="text-muted-foreground">
			Everything you stock, sell, buy, use or rent out. The ticks decide how it is tracked: medicine
			and food usually track lots and expiry; equipment tracks serial numbers.
		</p>
	</div>
	{#if data.canManage && data.supplierForm}
		<!-- Outside the item dialog, which is the kit's: the new supplier is then in its picker. -->
		<QuickSupplier
			form={data.supplierForm}
			onCreated={async (s) => {
				await invalidateAll();
				toast.success(`${s.name} added — pick it as the main supplier.`);
			}}
		/>
	{/if}
	<LookupSection
		config={{ entity: 'Item', plural: 'Items', fields, extraColumns }}
		rows={data.rows}
		addForm={data.addForm}
		editForm={data.editForm}
		canDelete={data.isSuperAdmin}
		{options}
		actions={{ add: '?/add', edit: '?/edit', delete: '?/delete' }}
		schemas={{ add: itemAdd, edit: itemEdit }}
		readonly={!data.canManage}
	/>
</div>
