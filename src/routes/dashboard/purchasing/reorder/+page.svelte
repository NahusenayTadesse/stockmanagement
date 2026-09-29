<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import ShoppingCart from '@lucide/svelte/icons/shopping-cart';
	import { Button } from '@nahu/admin-kit/components/ui/button/index.js';
	import { formatETB } from '@nahu/admin-kit/global';
	import { qty } from '$lib/format';
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
</script>

<svelte:head>
	<title>{m.purchasing_reorder_title()}</title>
</svelte:head>

<div class="flex flex-col gap-4">
	<div>
		<h1 class="text-2xl font-semibold">{m.purchasing_reorder_heading()}</h1>
		<p class="text-muted-foreground">
			{m.purchasing_reorder_intro()}
		</p>
	</div>

	<form method="GET" class="flex max-w-md flex-col gap-1 text-sm">
		<label for="plan-location">{m.purchasing_reorder_plan_for()}</label>
		<select
			id="plan-location"
			name="location"
			class="h-9 rounded-md border bg-background px-2"
			onchange={(e) => e.currentTarget.form?.requestSubmit()}
		>
			<option value="0" selected={!data.locationId}>{m.purchasing_reorder_whole()}</option>
			{#each data.locations as l (l.value)}
				<option value={l.value} selected={l.value === data.locationId}
					>{m.purchasing_reorder_location_opt({ name: l.name })}</option
				>
			{/each}
		</select>
		<noscript
			><Button type="submit" variant="outline">{m.purchasing_reorder_show()}</Button></noscript
		>
	</form>

	{#if !data.items.length}
		<p class="rounded-md border p-6 text-center text-muted-foreground">
			{data.locationId ? m.purchasing_reorder_nothing_here() : m.purchasing_reorder_nothing()}
		</p>
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
					<div class="overflow-x-auto rounded-md border">
						<table class="w-full text-sm">
							<thead class="bg-muted/50 text-left">
								<tr>
									<th class="w-10 px-3 py-2"
										><span class="sr-only">{m.purchasing_col_order_qty()}</span></th
									>
									<th class="px-3 py-2">{m.common_item()}</th>
									<th class="px-3 py-2 text-right">{m.purchasing_col_on_hand()}</th>
									<th class="px-3 py-2 text-right">{m.purchasing_col_held()}</th>
									<th class="px-3 py-2 text-right">{m.purchasing_col_min_max()}</th>
									<th class="px-3 py-2 text-right">{m.purchasing_col_use_day()}</th>
									<th class="px-3 py-2 text-right">{m.purchasing_col_days_left()}</th>
									<th class="px-3 py-2 text-right">{m.purchasing_col_lead_time()}</th>
									<th class="px-3 py-2 text-right">{m.purchasing_col_on_order()}</th>
									<th class="px-3 py-2 text-right">{m.purchasing_col_order_qty()}</th>
									<th class="px-3 py-2 text-right">{m.purchasing_col_est_cost()}</th>
								</tr>
							</thead>
							<tbody>
								{#each g.rows as r (r.id)}
									<tr class="border-t">
										<td class="px-3 py-2">
											<input
												type="checkbox"
												name="pick"
												value={r.id}
												checked={isPicked(r)}
												onchange={(e) => (ticks[r.id] = e.currentTarget.checked)}
												disabled={!g.supplierId || !data.canManage}
												aria-label={m.purchasing_order_item({ name: r.name })}
												class="size-4"
											/>
										</td>
										<td class="px-3 py-2">
											<a
												class="font-medium underline-offset-4 hover:underline"
												href={resolve('/dashboard/items/[id]', { id: String(r.id) })}>{r.name}</a
											>
											<p class="text-xs text-muted-foreground">
												{r.sku}{#if r.runsOut}
													· <span class="text-amber-600">{m.purchasing_runs_out()}</span>{/if}
											</p>
										</td>
										<td
											class="px-3 py-2 text-right {r.onHand <= 0
												? 'font-medium text-destructive'
												: ''}">{qty(r.onHand, r.unit)}</td
										>
										<td class="px-3 py-2 text-right">{r.held ? qty(r.held, r.unit) : '—'}</td>
										<td class="px-3 py-2 text-right">
											{r.reorderLevel === null ? '—' : qty(r.reorderLevel, r.unit)}
											{#if r.max !== null}/ {qty(r.max, r.unit)}{/if}
										</td>
										<td class="px-3 py-2 text-right">{r.usagePerDay || '—'}</td>
										<td
											class="px-3 py-2 text-right {r.daysLeft !== null &&
											r.daysLeft < r.leadTimeDays
												? 'font-medium text-destructive'
												: ''}">{r.daysLeft ?? '—'}</td
										>
										<td
											class="px-3 py-2 text-right"
											title={r.leadTimeAssumed ? m.purchasing_lead_assumed() : undefined}
											>{m.purchasing_days_short({ n: r.leadTimeDays })}{r.leadTimeAssumed
												? '*'
												: ''}</td
										>
										<td class="px-3 py-2 text-right">{r.onOrder ? qty(r.onOrder, r.unit) : '—'}</td>
										<td class="px-3 py-2 text-right">
											<input
												name="qty_{r.id}"
												type="number"
												min="0"
												step="any"
												inputmode="decimal"
												value={quantityOf(r)}
												oninput={(e) => (edits[r.id] = Number(e.currentTarget.value))}
												disabled={!g.supplierId || !data.canManage}
												aria-label={m.purchasing_quantity_of({ name: r.name })}
												class="h-9 w-24 rounded-md border bg-background px-2 text-right"
											/>
											<span class="ml-1 text-xs text-muted-foreground">{r.unit}</span>
										</td>
										<td class="px-3 py-2 text-right text-muted-foreground">
											{r.avgCost ? formatETB(quantityOf(r) * r.avgCost) : '—'}
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
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
