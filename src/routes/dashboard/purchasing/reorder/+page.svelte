<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import ShoppingCart from '@lucide/svelte/icons/shopping-cart';
	import type { ColumnDef } from '@tanstack/table-core';
	import { Button } from '@nahu/admin-kit/components/ui/button/index.js';
	import { renderSnippet } from '@nahu/admin-kit/components/ui/data-table/index.js';
	import DataTable from '@nahu/admin-kit/components/Table/data-table.svelte';
	import PageHeader from '@nahu/admin-kit/components/PageHeader.svelte';
	import Notice from '@nahu/admin-kit/components/Notice.svelte';
	import { formatETB } from '@nahu/admin-kit/global';
	import { qty } from '$lib/format';
	import FilterBar from '$lib/components/filters/FilterBar.svelte';
	import FilterSelect from '$lib/components/filters/FilterSelect.svelte';
	import { m } from '$lib/paraglide/messages.js';

	let { data } = $props();

	type Row = (typeof data.items)[number];

	/** Suppliers in the order the server sorted them, each with its items. */
	const groups = $derived.by(() => {
		const out: { key: string; supplier: string | null; supplierId: number | null; rows: Row[] }[] =
			[];
		for (const r of data.items) {
			const key = String(r.supplierId ?? 'none');
			let g = out.find((x) => x.key === key);
			if (!g) out.push((g = { key, supplier: r.supplier, supplierId: r.supplierId, rows: [] }));
			g.rows.push(r);
		}
		return out;
	});

	// What the user changed; everything else is the suggestion. Ticked by default: anything with a
	// suggested quantity and a supplier to order it from.
	let ticks = $state<Record<number, boolean>>({});
	let edits = $state<Record<number, number>>({});
	const quantityOf = (r: Row) => edits[r.id] ?? r.suggested;
	const isPicked = (r: Row) => ticks[r.id] ?? (r.suggested > 0 && r.supplierId !== null);

	const chosen = $derived(data.items.filter((r) => isPicked(r) && quantityOf(r) > 0));
	const suppliersChosen = $derived(new Set(chosen.map((r) => r.supplierId)).size);
	const estimate = $derived(chosen.reduce((s, r) => s + quantityOf(r) * r.avgCost, 0));
	let busy = $state(false);

	/** Deliveries go where the plan is for — or, planning the whole business, a store room. */
	const defaultLocation = $derived(
		data.locationId ??
			(data.locations.find((l) => l.kind === 'storage') ?? data.locations[0])?.value
	);

	/** The plan's locations, as the filter offers them. */
	const planOptions = $derived(
		data.locations.map((l) => ({
			value: l.value,
			name: m.purchasing_reorder_location_opt({ name: l.name })
		}))
	);

	// One sheet per supplier: every row on screen, since each carries inputs the form submits.
	const columns: ColumnDef<Row>[] = [
		{
			id: 'pick',
			header: () => renderSnippet(srOnly, { text: m.purchasing_col_order_qty() }),
			cell: ({ row }) => renderSnippet(pickCell, row.original)
		},
		{
			accessorKey: 'name',
			header: m.common_item(),
			cell: ({ row }) => renderSnippet(itemCell, row.original)
		},
		{
			accessorKey: 'onHand',
			header: m.purchasing_col_on_hand(),
			cell: ({ row }) => renderSnippet(onHandCell, row.original)
		},
		{
			accessorKey: 'held',
			meta: { align: 'right' },
			header: m.purchasing_col_held(),
			cell: ({ row }) => (row.original.held ? qty(row.original.held, row.original.unit) : '—')
		},
		{
			id: 'minMax',
			header: m.purchasing_col_min_max(),
			cell: ({ row }) => {
				const r = row.original;
				const min = r.reorderLevel === null ? '—' : qty(r.reorderLevel, r.unit);
				return r.max !== null ? `${min} / ${qty(r.max, r.unit)}` : min;
			}
		},
		{
			accessorKey: 'usagePerDay',
			header: m.purchasing_col_use_day(),
			cell: ({ row }) => row.original.usagePerDay || '—'
		},
		{
			accessorKey: 'daysLeft',
			header: m.purchasing_col_days_left(),
			cell: ({ row }) => renderSnippet(daysLeftCell, row.original)
		},
		{
			accessorKey: 'leadTimeDays',
			header: m.purchasing_col_lead_time(),
			cell: ({ row }) => renderSnippet(leadTimeCell, row.original)
		},
		{
			accessorKey: 'onOrder',
			meta: { align: 'right' },
			header: m.purchasing_col_on_order(),
			cell: ({ row }) => (row.original.onOrder ? qty(row.original.onOrder, row.original.unit) : '—')
		},
		{
			id: 'quantity',
			header: m.purchasing_col_order_qty(),
			cell: ({ row }) => renderSnippet(quantityCell, row.original)
		},
		{
			id: 'cost',
			header: m.purchasing_col_est_cost(),
			cell: ({ row }) => renderSnippet(costCell, row.original)
		}
	];
</script>

{#snippet srOnly({ text }: { text: string })}<span class="sr-only">{text}</span>{/snippet}

{#snippet pickCell(r: Row)}
	<input
		type="checkbox"
		name="pick"
		value={r.id}
		checked={isPicked(r)}
		onchange={(e) => (ticks[r.id] = e.currentTarget.checked)}
		disabled={!r.supplierId || !data.canManage}
		aria-label={m.purchasing_order_item({ name: r.name })}
		class="size-4"
	/>
{/snippet}

{#snippet itemCell(r: Row)}
	<a
		class="font-medium underline-offset-4 hover:underline"
		href={resolve('/dashboard/items/[id]', { id: String(r.id) })}>{r.name}</a
	>
	<p class="text-xs text-muted-foreground">
		{r.sku}{#if r.runsOut}
			· <span class="text-amber-600">{m.purchasing_runs_out()}</span>{/if}
	</p>
{/snippet}

{#snippet onHandCell(r: Row)}
	<span class={r.onHand <= 0 ? 'font-medium text-destructive' : ''}>{qty(r.onHand, r.unit)}</span>
{/snippet}

{#snippet daysLeftCell(r: Row)}
	<span
		class={r.daysLeft !== null && r.daysLeft < r.leadTimeDays ? 'font-medium text-destructive' : ''}
		>{r.daysLeft ?? '—'}</span
	>
{/snippet}

{#snippet leadTimeCell(r: Row)}
	<span title={r.leadTimeAssumed ? m.purchasing_lead_assumed() : undefined}
		>{m.purchasing_days_short({ n: r.leadTimeDays })}{r.leadTimeAssumed ? '*' : ''}</span
	>
{/snippet}

{#snippet quantityCell(r: Row)}
	<input
		name="qty_{r.id}"
		type="number"
		min="0"
		step="any"
		inputmode="decimal"
		value={quantityOf(r)}
		oninput={(e) => (edits[r.id] = Number(e.currentTarget.value))}
		disabled={!r.supplierId || !data.canManage}
		aria-label={m.purchasing_quantity_of({ name: r.name })}
		class="h-9 w-24 rounded-md border bg-background px-2 text-right"
	/>
	<span class="ml-1 text-xs text-muted-foreground">{r.unit}</span>
{/snippet}

{#snippet costCell(r: Row)}
	<span class="text-muted-foreground">{r.avgCost ? formatETB(quantityOf(r) * r.avgCost) : '—'}</span
	>
{/snippet}

<div class="flex flex-col gap-4">
	<PageHeader
		title={m.purchasing_reorder_heading()}
		tabTitle={m.purchasing_reorder_title()}
		description={m.purchasing_reorder_intro()}
	/>

	<FilterBar submitLabel={m.purchasing_reorder_show()}>
		<FilterSelect
			name="location"
			label={m.purchasing_reorder_plan_for()}
			value={data.locationId ?? 0}
			options={planOptions}
			anyLabel={m.purchasing_reorder_whole()}
			anyValue={0}
		/>
	</FilterBar>

	{#if !data.items.length}
		<Notice tone="info">
			{data.locationId ? m.purchasing_reorder_nothing_here() : m.purchasing_reorder_nothing()}
		</Notice>
	{:else}
		<form
			method="POST"
			action="?/create"
			class="flex flex-col gap-4"
			use:enhance={() => {
				busy = true;
				return async ({ update }) => {
					await update();
					busy = false;
				};
			}}
		>
			{#each groups as g (g.key)}
				<section class="flex flex-col gap-2">
					<h2 class="text-lg font-semibold">
						{#if g.supplierId}
							<a
								class="underline-offset-4 hover:underline"
								href={resolve('/dashboard/suppliers/[id]', { id: String(g.supplierId) })}
								>{g.supplier}</a
							>
						{:else}
							{m.purchasing_reorder_no_supplier()}
							<span class="text-sm font-normal text-muted-foreground"
								>{m.purchasing_reorder_no_supplier_hint()}</span
							>
						{/if}
					</h2>
					<DataTable variant="sheet" data={g.rows} {columns} fileName={g.supplier ?? ''} />
				</section>
			{/each}

			{#if data.canManage}
				<div
					class="sticky bottom-0 flex flex-wrap items-end gap-3 rounded-md border bg-background p-3 shadow-sm"
				>
					<label class="flex flex-col gap-1 text-sm">
						{m.purchasing_f_deliver_to()}
						<select name="locationId" class="h-9 rounded-md border bg-background px-2" required>
							{#each data.locations as l (l.value)}
								<option value={l.value} selected={l.value === defaultLocation}>{l.name}</option>
							{/each}
						</select>
					</label>
					<p class="text-sm text-muted-foreground">
						{m.purchasing_reorder_summary({
							items:
								chosen.length === 1
									? m.purchasing_n_item_one()
									: m.purchasing_n_items({ n: chosen.length }),
							suppliers:
								suppliersChosen === 1
									? m.purchasing_n_supplier_one()
									: m.purchasing_n_suppliers({ n: suppliersChosen }),
							estimate: formatETB(estimate)
						})}
					</p>
					<Button type="submit" class="ml-auto" disabled={busy || !chosen.length}>
						<ShoppingCart />
						{busy
							? m.purchasing_creating_ellipsis()
							: suppliersChosen === 1
								? m.purchasing_create_orders_one()
								: suppliersChosen
									? m.purchasing_create_orders_many({ n: suppliersChosen })
									: m.purchasing_create_orders_none()}
					</Button>
				</div>
			{/if}
		</form>
	{/if}
</div>
