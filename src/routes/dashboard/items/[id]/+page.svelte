<script lang="ts">
	import { m } from '$lib/paraglide/messages.js';
	import { resolve } from '$app/paths';
	import { getLocale } from '$lib/paraglide/runtime';
	import DataTable from '@nahu/admin-kit/components/Table/data-table.svelte';
	import LookupSection from '@nahu/admin-kit/components/lookup/LookupSection.svelte';
	import SingleTable from '@nahu/admin-kit/components/SingleTable.svelte';
	import * as Card from '@nahu/admin-kit/components/ui/card/index.js';
	import { Badge } from '@nahu/admin-kit/components/ui/badge/index.js';
	import { formatETB } from '@nahu/admin-kit/global';
	import { barcodeAdd, barcodeEdit, STORAGE_CHOICES, unitAdd, unitEdit } from '$lib/schemas/items';
	import { TAX_CODE_LABELS, qty } from '$lib/format';
	import { cardColumns, stockColumns } from './columns';
	import KitComponents from './KitComponents.svelte';
	import Variants from './Variants.svelte';
	import ReorderRules from './ReorderRules.svelte';

	let { data } = $props();

	const it = $derived(data.item);
	/** In the Amharic interface, the item's Amharic name leads when it has one. */
	const title = $derived(getLocale() === 'am' && it.nameAm ? it.nameAm : it.name);
	const total = $derived(data.stock.reduce((sum, r) => sum + Number(r.quantity), 0));

	const flags = $derived(
		(
			[
				it.isKit ? m.stock_t_kit() : !it.stockTracked && m.stock_flag_service(),
				it.parentItemId && m.stock_flag_variant({ label: it.variantLabel ?? '' }),
				it.trackLots && m.stock_flag_lots(),
				it.trackExpiry && m.stock_flag_expiry(),
				it.trackSerials && m.stock_flag_serials(),
				it.sellable && m.stock_f_sold(),
				it.purchasable && m.stock_f_bought(),
				it.leasable && m.stock_f_rented(),
				it.consumable && m.stock_f_consumable(),
				it.perishable && m.stock_f_perishable(),
				it.prescriptionOnly && m.stock_f_prescription(),
				it.controlledSubstance && m.stock_flag_controlled()
			] as (string | false | null | 0)[]
		).filter((f): f is string => Boolean(f))
	);

	const details = $derived([
		{ name: m.stock_col_code(), value: it.sku },
		...(data.parent
			? [
					{
						name: m.stock_variant_of(),
						value: `${data.parent.name} — ${data.parent.sku}`,
						href: resolve('/dashboard/items/[id]', { id: String(data.parent.id) })
					}
				]
			: []),
		{ name: m.stock_amharic_name(), value: it.nameAm || '—' },
		{ name: m.stock_col_category(), value: data.category ?? '—' },
		{
			name: m.stock_f_main_supplier(),
			value: data.supplier
				? `${data.supplier.name}${data.supplier.phone ? ` · ${data.supplier.phone}` : ''}`
				: '—',
			href: data.supplier
				? resolve('/dashboard/suppliers/[id]', { id: String(data.supplier.id) })
				: null
		},
		{
			name: m.stock_f_counted_in(),
			value: data.base ? `${data.base.name} (${data.base.symbol})` : '—'
		},
		{
			name: m.stock_f_storage(),
			value:
				STORAGE_CHOICES.find((c) => c.value === it.storageCondition)?.name ?? it.storageCondition
		},
		{ name: m.stock_on_hand(), value: qty(total, data.base?.symbol) },
		{ name: m.stock_average_cost(), value: formatETB(it.avgCost) },
		{ name: m.stock_stock_value(), value: formatETB(total * it.avgCost) },
		{ name: m.stock_sale_price(), value: it.salePrice == null ? '—' : formatETB(it.salePrice) },
		{ name: m.stock_f_vat(), value: TAX_CODE_LABELS[it.taxCode] ?? it.taxCode },
		{
			name: m.stock_warranty(),
			value: it.warrantyMonths ? m.stock_warranty_months({ months: it.warrantyMonths }) : '—'
		},
		{
			name: m.stock_weight(),
			value:
				it.weightKg == null
					? '—'
					: m.stock_weight_per({ kg: it.weightKg, unit: data.base?.symbol ?? m.stock_unit_word() })
		},
		{
			name: m.stock_reorder_at(),
			value: it.reorderLevel == null ? '—' : qty(it.reorderLevel, data.base?.symbol)
		}
	]);

	const unitOptions = $derived({ uomId: data.unitList });
	const barcodeUnitOptions = $derived({
		uomId: [{ value: 0, name: m.stock_base_unit() }, ...data.unitList]
	});
</script>

<svelte:head>
	<title>{title}</title>
</svelte:head>

<div class="flex flex-col gap-8">
	<div class="flex flex-col gap-2">
		<h1 class="text-2xl font-semibold">{title}</h1>
		{#if title !== it.name}<p class="text-muted-foreground">{it.name}</p>{/if}
		<div class="flex flex-wrap gap-1">
			{#each flags as f (f)}<Badge variant="secondary">{f}</Badge>{/each}
			{#if !it.isActive}<Badge variant="destructive">{m.stock_inactive()}</Badge>{/if}
		</div>
	</div>

	<div class="grid gap-6 lg:grid-cols-2">
		<Card.Root>
			<Card.Content><SingleTable singleTable={details} /></Card.Content>
		</Card.Root>

		<div class="flex flex-col gap-6">
			<Card.Root>
				<Card.Header>
					<Card.Title>{m.stock_pack_units()}</Card.Title>
					<Card.Description>
						{m.stock_pack_units_hint({ base: data.base?.symbol ?? m.stock_base_units() })}
					</Card.Description>
				</Card.Header>
				<Card.Content>
					<LookupSection
						config={{
							entity: m.stock_unit(),
							plural: m.stock_units(),
							fields: [
								{
									name: 'uomId',
									label: m.stock_unit(),
									type: 'reference',
									options: 'unitList',
									display: 'unit',
									picker: 'select'
								},
								{
									name: 'factor',
									label: m.stock_in_one({ unit: data.base?.symbol ?? m.stock_base_units() }),
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
					<Card.Title>{m.stock_barcodes()}</Card.Title>
				</Card.Header>
				<Card.Content>
					<LookupSection
						config={{
							entity: m.stock_barcode(),
							plural: m.stock_barcodes(),
							fields: [
								{ name: 'code', label: m.stock_col_code(), type: 'text' },
								{
									name: 'uomId',
									label: m.stock_identifies(),
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

	{#if data.kit}
		<section class="flex flex-col gap-2">
			<h2 class="text-xl font-semibold">{m.stock_components()}</h2>
			<p class="text-sm text-muted-foreground">
				{m.stock_components_hint({ unit: data.base?.symbol ?? m.stock_unit_word() })}
			</p>
			<KitComponents
				kit={data.kit}
				unitList={data.unitList}
				salePrice={it.salePrice}
				unit={data.base?.symbol}
				readonly={!data.canManage}
			/>
		</section>
	{/if}

	{#if !data.parent}
		<section class="flex flex-col gap-2">
			<h2 class="text-xl font-semibold">{m.stock_variants()}</h2>
			<Variants variants={data.variants} form={data.variantForm} unit={data.base?.symbol} />
		</section>
	{/if}

	{#if it.stockTracked}
		<section class="flex flex-col gap-2">
			<h2 class="text-xl font-semibold">{m.stock_reorder_by_location()}</h2>
			<ReorderRules
				rules={data.rules}
				locations={data.ruleLocations}
				unit={data.base?.symbol}
				readonly={!data.canManage}
			/>
		</section>
	{/if}

	{#if data.held.length}
		<section class="flex flex-col gap-2">
			<h2 class="text-xl font-semibold">{m.stock_held()}</h2>
			<p class="text-sm text-muted-foreground">
				{m.stock_held_hint()}
			</p>
			<ul class="divide-y rounded-md border text-sm">
				{#each data.held as h (h.id)}
					<li class="flex flex-wrap justify-between gap-2 px-3 py-2">
						<span>{h.for} · {h.location}</span>
						<span class="font-medium">{qty(h.quantity, data.base?.symbol ?? '')}</span>
					</li>
				{/each}
			</ul>
		</section>
	{/if}

	<section class="flex flex-col gap-2">
		<h2 class="text-xl font-semibold">{m.stock_where_it_is()}</h2>
		{#if data.stock.length}
			<DataTable
				data={data.stock}
				columns={stockColumns}
				fileName={m.stock_stock_file({ item: it.name })}
				height="auto"
			/>
		{:else}
			<p class="text-muted-foreground">{m.stock_none_in_stock()}</p>
		{/if}
	</section>

	<section class="flex flex-col gap-2">
		<h2 class="text-xl font-semibold">{m.stock_bin_card()}</h2>
		<p class="text-sm text-muted-foreground">
			{m.stock_bin_card_hint()}
		</p>
		{#if data.card.length}
			<DataTable
				data={data.card}
				columns={cardColumns}
				fileName={m.stock_bin_card_file({ item: it.name })}
				height="auto"
			/>
		{:else}
			<p class="text-muted-foreground">{m.stock_no_movements()}</p>
		{/if}
	</section>
</div>
