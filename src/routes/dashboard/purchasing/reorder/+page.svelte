<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import ShoppingCart from '@lucide/svelte/icons/shopping-cart';
	import { Button } from '@nahu/admin-kit/components/ui/button/index.js';
	import { formatETB } from '@nahu/admin-kit/global';
	import { qty } from '$lib/format';

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
	<title>Reorder</title>
</svelte:head>

<div class="flex flex-col gap-4">
	<div>
		<h1 class="text-2xl font-semibold">What to reorder</h1>
		<p class="text-muted-foreground">
			Items whose free stock (on hand, less what is held for proformas and requisitions) is at or
			below their minimum, and items that — at the rate they were used over the last 90 days — will
			run out before a delivery ordered today could arrive. The suggestion fills up to the maximum
			(twice the minimum when there is none), or enough for the supplier's lead time and a month
			after, less what is on order. Orders are created as drafts you can still change.
		</p>
	</div>

	<form method="GET" class="flex max-w-md flex-col gap-1 text-sm">
		<label for="plan-location">Plan for</label>
		<select
			id="plan-location"
			name="location"
			class="h-9 rounded-md border bg-background px-2"
			onchange={(e) => e.currentTarget.form?.requestSubmit()}
		>
			<option value="0" selected={!data.locationId}
				>The whole business (items' reorder levels)</option
			>
			{#each data.locations as l (l.value)}
				<option value={l.value} selected={l.value === data.locationId}
					>{l.name} (its minimum and maximum)</option
				>
			{/each}
		</select>
		<noscript><Button type="submit" variant="outline">Show</Button></noscript>
	</form>

	{#if !data.items.length}
		<p class="rounded-md border p-6 text-center text-muted-foreground">
			Nothing needs reordering {data.locationId ? 'here' : ''}. Set minimum and maximum levels on an
			item's page (per location), or a reorder level, to plan by them.
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
							No main supplier
							<span class="text-sm font-normal text-muted-foreground"
								>— set one on the item to order it from here</span
							>
						{/if}
					</h2>
					<div class="overflow-x-auto rounded-md border">
						<table class="w-full text-sm">
							<thead class="bg-muted/50 text-left">
								<tr>
									<th class="w-10 px-3 py-2"><span class="sr-only">Order</span></th>
									<th class="px-3 py-2">Item</th>
									<th class="px-3 py-2 text-right">On hand</th>
									<th class="px-3 py-2 text-right">Held</th>
									<th class="px-3 py-2 text-right">Min / max</th>
									<th class="px-3 py-2 text-right">Use / day</th>
									<th class="px-3 py-2 text-right">Days left</th>
									<th class="px-3 py-2 text-right">Lead time</th>
									<th class="px-3 py-2 text-right">On order</th>
									<th class="px-3 py-2 text-right">Order</th>
									<th class="px-3 py-2 text-right">Est. cost</th>
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
												aria-label="Order {r.name}"
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
													· <span class="text-amber-600">runs out before a delivery</span>{/if}
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
											title={r.leadTimeAssumed
												? 'The supplier has no lead time; a week is assumed'
												: undefined}>{r.leadTimeDays} d{r.leadTimeAssumed ? '*' : ''}</td
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
												aria-label="Quantity of {r.name}"
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
						Deliver to
						<select name="locationId" class="h-9 rounded-md border bg-background px-2" required>
							{#each data.locations as l (l.value)}
								<option value={l.value} selected={l.value === defaultLocation}>{l.name}</option>
							{/each}
						</select>
					</label>
					<p class="text-sm text-muted-foreground">
						{chosen.length} item{chosen.length === 1 ? '' : 's'} from {suppliersChosen} supplier{suppliersChosen ===
						1
							? ''
							: 's'} · about {formatETB(estimate)} at average cost
					</p>
					<Button type="submit" class="ml-auto" disabled={busy || !chosen.length}>
						<ShoppingCart />
						{busy
							? 'Creating…'
							: `Create ${suppliersChosen || ''} draft order${suppliersChosen === 1 ? '' : 's'}`}
					</Button>
				</div>
			{/if}
		</form>
	{/if}
</div>
