<script lang="ts">
	import { m } from '$lib/paraglide/messages.js';
	import LookupSection from '@nahu/admin-kit/components/lookup/LookupSection.svelte';
	import type { LookupField } from '@nahu/admin-kit/components/lookup/types';
	import { itemAdd, itemEdit, STORAGE_CHOICES, TAX_CODE_CHOICES } from '$lib/schemas/items';
	import { extraColumns } from './columns';
	import { invalidateAll } from '$app/navigation';
	import { toast } from 'svelte-sonner';
	import QuickSupplier from '$lib/components/QuickSupplier.svelte';
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import Barcode from '@lucide/svelte/icons/barcode';
	import { getLocale } from '$lib/paraglide/runtime';
	import { Button } from '@nahu/admin-kit/components/ui/button/index.js';

	let { data } = $props();

	const flag = (name: string, label: string): LookupField => ({
		name,
		label,
		type: 'checkbox',
		required: false,
		inTable: false,
		trueLabel: m.common_yes(),
		falseLabel: m.common_no()
	});

	const fields: LookupField[] = [
		{ name: 'name', label: m.common_name(), type: 'text' },
		{ name: 'sku', label: m.stock_f_code_sku(), type: 'text' },
		// The Amharic name shows as a column when the interface is in Amharic.
		{
			name: 'nameAm',
			label: m.stock_f_name_am(),
			type: 'text',
			required: false,
			inTable: getLocale() === 'am'
		},
		{ name: 'variantLabel', label: m.stock_f_variant(), type: 'text', required: false },
		{
			name: 'parentItemId',
			label: m.stock_f_variant_of(),
			type: 'reference',
			options: 'parentList',
			display: 'parent',
			required: false,
			inTable: false
		},
		{
			name: 'categoryId',
			label: m.stock_col_category(),
			type: 'reference',
			options: 'categoryList',
			display: 'category',
			required: false
		},
		{
			name: 'supplierId',
			label: m.stock_f_main_supplier(),
			type: 'reference',
			options: 'supplierList',
			display: 'supplier',
			// The server insists for stock-tracked items; services may leave it empty.
			required: false
		},
		{
			name: 'baseUomId',
			label: m.stock_f_counted_in(),
			type: 'reference',
			options: 'unitList',
			display: 'unit'
		},
		{ name: 'salePrice', label: m.stock_f_sale_price(), type: 'money', required: false },
		{
			name: 'taxCode',
			label: m.stock_f_vat(),
			type: 'select',
			choices: TAX_CODE_CHOICES,
			inTable: false
		},
		{
			name: 'totRate',
			label: m.stock_f_tot(),
			type: 'number',
			required: false,
			inTable: false
		},
		{
			name: 'reorderLevel',
			label: m.stock_f_reorder(),
			type: 'number',
			required: false,
			inTable: false
		},
		{
			name: 'warrantyMonths',
			label: m.stock_f_warranty(),
			type: 'number',
			required: false,
			inTable: false
		},
		{
			name: 'weightKg',
			label: m.stock_f_weight(),
			type: 'number',
			required: false,
			inTable: false
		},
		{
			name: 'storageCondition',
			label: m.stock_f_storage(),
			type: 'select',
			choices: STORAGE_CHOICES,
			inTable: false
		},
		flag('stockTracked', m.stock_f_stock_tracked()),
		flag('isKit', m.stock_f_is_kit()),
		flag('trackLots', m.stock_f_track_lots()),
		flag('trackExpiry', m.stock_f_track_expiry()),
		flag('trackSerials', m.stock_f_track_serials()),
		flag('sellable', m.stock_f_sold()),
		flag('purchasable', m.stock_f_bought()),
		flag('leasable', m.stock_f_rented()),
		flag('consumable', m.stock_f_consumable()),
		flag('perishable', m.stock_f_perishable()),
		flag('prescriptionOnly', m.stock_f_prescription()),
		flag('controlledSubstance', m.stock_f_controlled()),
		{
			name: 'description',
			label: m.stock_f_description(),
			type: 'textarea',
			rows: 3,
			required: false,
			inTable: false
		},
		{ name: 'status', label: m.common_status(), type: 'boolean' }
	];

	const options = $derived({
		categoryId: data.categoryList,
		baseUomId: data.unitList,
		supplierId: data.supplierList,
		parentItemId: data.parentList
	});
</script>

<svelte:head>
	<title>{m.common_items()}</title>
</svelte:head>

<div class="flex flex-col gap-4">
	<div>
		<h1 class="text-2xl font-semibold">{m.stock_items_count({ count: data.rows.length })}</h1>
		<p class="text-muted-foreground">
			{m.stock_items_intro()}
		</p>
	</div>
	<div class="flex flex-wrap items-center gap-2">
		<Button variant="outline" size="sm" href={resolve('/dashboard/items/labels')}>
			<Barcode class="size-4" />
			{m.stock_print_labels()}
		</Button>
		{#if data.canManage && data.withoutBarcode}
			<form method="POST" action="?/generateBarcodes" use:enhance>
				<Button type="submit" variant="outline" size="sm">
					{m.stock_give_barcodes({ count: data.withoutBarcode })}
				</Button>
			</form>
		{/if}
	</div>
	{#if data.canManage && data.supplierForm}
		<!-- Outside the item dialog, which is the kit's: the new supplier is then in its picker. -->
		<QuickSupplier
			form={data.supplierForm}
			onCreated={async (s) => {
				await invalidateAll();
				toast.success(m.stock_supplier_added_pick({ name: s.name }));
			}}
		/>
	{/if}
	<LookupSection
		config={{ entity: m.stock_item(), plural: m.common_items(), fields, extraColumns }}
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
