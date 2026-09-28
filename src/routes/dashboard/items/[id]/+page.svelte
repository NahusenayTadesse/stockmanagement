<script lang="ts">
	import { resolve } from '$app/paths';
	import DataTable from '@nahu/admin-kit/components/Table/data-table.svelte';
	import LookupSection from '@nahu/admin-kit/components/lookup/LookupSection.svelte';
	import SingleTable from '@nahu/admin-kit/components/SingleTable.svelte';
	import * as Card from '@nahu/admin-kit/components/ui/card/index.js';
	import { Badge } from '@nahu/admin-kit/components/ui/badge/index.js';
	import { formatETB } from '@nahu/admin-kit/global';
	import { barcodeAdd, barcodeEdit, STORAGE_CHOICES, unitAdd, unitEdit } from '$lib/schemas/items';
	import { qty } from '$lib/format';
	import { cardColumns, stockColumns } from './columns';

	let { data } = $props();

	const it = $derived(data.item);
	const total = $derived(data.stock.reduce((sum, r) => sum + Number(r.quantity), 0));

	const flags = $derived(
		[
			!it.stockTracked && 'Service (not counted)',
			it.trackLots && 'Lots',
			it.trackExpiry && 'Expiry dates',
			it.trackSerials && 'Serial numbers',
			it.sellable && 'Sold',
			it.purchasable && 'Bought',
			it.leasable && 'Rented out',
			it.consumable && 'Used internally',
			it.perishable && 'Perishable',
			it.prescriptionOnly && 'Prescription only',
			it.controlledSubstance && 'Controlled substance'
		].filter((f): f is string => Boolean(f))
	);

	const details = $derived([
		{ name: 'Code', value: it.sku },
		{ name: 'Amharic name', value: it.nameAm || '—' },
		{ name: 'Category', value: data.category ?? '—' },
		{
			name: 'Main supplier',
			value: data.supplier
				? `${data.supplier.name}${data.supplier.phone ? ` · ${data.supplier.phone}` : ''}`
				: '—',
			href: data.supplier
				? resolve('/dashboard/suppliers/[id]', { id: String(data.supplier.id) })
				: null
		},
		{ name: 'Counted in', value: data.base ? `${data.base.name} (${data.base.symbol})` : '—' },
		{
			name: 'Storage',
			value:
				STORAGE_CHOICES.find((c) => c.value === it.storageCondition)?.name ?? it.storageCondition
		},
		{ name: 'On hand', value: qty(total, data.base?.symbol) },
		{ name: 'Average cost', value: formatETB(it.avgCost) },
		{ name: 'Stock value', value: formatETB(total * it.avgCost) },
		{ name: 'Sale price', value: it.salePrice == null ? '—' : formatETB(it.salePrice) },
		{
			name: 'Reorder at',
			value: it.reorderLevel == null ? '—' : qty(it.reorderLevel, data.base?.symbol)
		}
	]);

	const unitOptions = $derived({ uomId: data.unitList });
	const barcodeUnitOptions = $derived({
		uomId: [{ value: 0, name: 'Base unit' }, ...data.unitList]
	});
</script>

<svelte:head>
	<title>{it.name}</title>
</svelte:head>

<div class="flex flex-col gap-8">
	<div class="flex flex-col gap-2">
		<h1 class="text-2xl font-semibold">{it.name}</h1>
		<div class="flex flex-wrap gap-1">
			{#each flags as f (f)}<Badge variant="secondary">{f}</Badge>{/each}
			{#if !it.isActive}<Badge variant="destructive">Inactive</Badge>{/if}
		</div>
	</div>

	<div class="grid gap-6 lg:grid-cols-2">
		<Card.Root>
			<Card.Content><SingleTable singleTable={details} /></Card.Content>
		</Card.Root>

		<div class="flex flex-col gap-6">
			<Card.Root>
				<Card.Header>
					<Card.Title>Pack units</Card.Title>
					<Card.Description>
						Other units this item is bought, sold or counted in, and how many
						{data.base?.symbol ?? 'base units'} each one is.
					</Card.Description>
				</Card.Header>
				<Card.Content>
					<LookupSection
						config={{
							entity: 'Unit',
							plural: 'Units',
							fields: [
								{
									name: 'uomId',
									label: 'Unit',
									type: 'reference',
									options: 'unitList',
									display: 'unit',
									picker: 'select'
								},
								{
									name: 'factor',
									label: `${data.base?.symbol ?? 'Base units'} in one`,
									type: 'number'
								}
							]
						}}
						rows={data.units.rows}
						addForm={data.units.addForm}
						editForm={data.units.editForm}
						canDelete={data.canManage}
						options={unitOptions}
						actions={{ add: '?/addUnit', edit: '?/editUnit', delete: '?/deleteUnit' }}
						schemas={{ add: unitAdd, edit: unitEdit }}
						readonly={!data.canManage}
					/>
				</Card.Content>
			</Card.Root>

			<Card.Root>
				<Card.Header>
					<Card.Title>Barcodes</Card.Title>
				</Card.Header>
				<Card.Content>
					<LookupSection
						config={{
							entity: 'Barcode',
							plural: 'Barcodes',
							fields: [
								{ name: 'code', label: 'Code', type: 'text' },
								{
									name: 'uomId',
									label: 'Identifies',
									type: 'reference',
									options: 'unitList',
									display: 'unit',
									picker: 'select',
									required: false
								}
							]
						}}
						rows={data.barcodes.rows}
						addForm={data.barcodes.addForm}
						editForm={data.barcodes.editForm}
						canDelete={data.canManage}
						options={barcodeUnitOptions}
						actions={{ add: '?/addBarcode', edit: '?/editBarcode', delete: '?/deleteBarcode' }}
						schemas={{ add: barcodeAdd, edit: barcodeEdit }}
						readonly={!data.canManage}
					/>
				</Card.Content>
			</Card.Root>
		</div>
	</div>

	<section class="flex flex-col gap-2">
		<h2 class="text-xl font-semibold">Where it is</h2>
		{#if data.stock.length}
			<DataTable
				data={data.stock}
				columns={stockColumns}
				fileName="{it.name} stock"
				height="auto"
			/>
		{:else}
			<p class="text-muted-foreground">None in stock.</p>
		{/if}
	</section>

	<section class="flex flex-col gap-2">
		<h2 class="text-xl font-semibold">Bin card</h2>
		<p class="text-sm text-muted-foreground">
			Every movement, newest first, with the balance after it.
		</p>
		{#if data.card.length}
			<DataTable
				data={data.card}
				columns={cardColumns}
				fileName="{it.name} bin card"
				height="auto"
			/>
		{:else}
			<p class="text-muted-foreground">No movements yet.</p>
		{/if}
	</section>
</div>
