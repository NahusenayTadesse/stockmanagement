<script lang="ts">
	import { resolve } from '$app/paths';
	import * as Card from '@nahu/admin-kit/components/ui/card/index.js';
	import { Badge } from '@nahu/admin-kit/components/ui/badge/index.js';
	import { Button } from '@nahu/admin-kit/components/ui/button/index.js';
	import { Input } from '@nahu/admin-kit/components/ui/input/index.js';
	import { Label } from '@nahu/admin-kit/components/ui/label/index.js';
	import { formatEthiopianDate } from '@nahu/admin-kit/global';
	import { MOVEMENT_LABELS } from '$lib/format';

	let { data } = $props();

	const day = (d: string) => formatEthiopianDate(new Date(`${d}T12:00:00+03:00`));
	const STATUS: Record<string, string> = {
		in_stock: 'In stock',
		issued: 'Sold / issued',
		leased: 'Leased out',
		maintenance: 'In maintenance',
		disposed: 'Written off or lost',
		returned: 'Returned to supplier'
	};
	const kindName = (k: string) =>
		MOVEMENT_LABELS[k] ?? (k === 'transit_loss' ? 'Lost in transit' : k);
</script>

<svelte:head>
	<title>Serial lookup</title>
</svelte:head>

<div class="flex flex-col gap-6">
	<div>
		<h1 class="text-2xl font-semibold">Serial lookup</h1>
		<p class="text-muted-foreground">
			Find one unit by its serial number (IMEI, chassis, engine number — any part of it): where it
			is now, who supplied it, everything that happened to it, who bought it and whether it is still
			under warranty.
		</p>
	</div>

	<Card.Root>
		<Card.Content class="pt-6">
			<form method="GET" class="flex flex-wrap items-end gap-3">
				<div class="flex min-w-64 flex-col gap-1">
					<Label for="q">Serial number</Label>
					<Input id="q" name="q" value={data.q} placeholder="At least 2 characters" autofocus />
				</div>
				<Button type="submit">Find</Button>
			</form>
		</Card.Content>
	</Card.Root>

	{#if data.q && !data.units.length}
		<p class="text-muted-foreground">No serial number contains “{data.q}”.</p>
	{/if}
	{#if data.units.length === 25}
		<p class="text-sm text-muted-foreground">
			Showing the first 25 matches. Type more of the number.
		</p>
	{/if}

	{#each data.units as u (u.id)}
		<Card.Root>
			<Card.Header>
				<Card.Title class="flex flex-wrap items-center gap-2">
					<span class="font-mono">{u.serialNumber}</span>
					<Badge variant="secondary">{STATUS[u.status] ?? u.status}</Badge>
					{#if u.warranty.state === 'active'}
						<Badge class="bg-green-600 text-white"
							>Under warranty until {day(u.warranty.until)}</Badge
						>
					{:else if u.warranty.state === 'expired'}
						<Badge class="bg-red-600 text-white">Warranty expired {day(u.warranty.until)}</Badge>
					{/if}
				</Card.Title>
				<Card.Description>
					<a class="underline" href={resolve('/dashboard/items/[id]', { id: String(u.itemId) })}
						>{u.item}</a
					>
					· {u.sku}
				</Card.Description>
			</Card.Header>
			<Card.Content class="flex flex-col gap-4">
				<dl class="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
					<div>
						<dt class="text-muted-foreground">Where it is</dt>
						<dd>{u.location ?? (u.status === 'in_stock' ? '—' : 'Not in the business')}</dd>
					</div>
					<div>
						<dt class="text-muted-foreground">Supplied by</dt>
						<dd>
							{#if u.supplierId}
								<a
									class="underline"
									href={resolve('/dashboard/suppliers/[id]', { id: String(u.supplierId) })}
									>{u.supplier}</a
								>
							{:else}—{/if}
						</dd>
					</div>
					<div>
						<dt class="text-muted-foreground">Lot</dt>
						<dd>
							{u.lotNumber ?? '—'}{u.expiryDate ? ` · expires ${day(u.expiryDate)}` : ''}
						</dd>
					</div>
					<div>
						<dt class="text-muted-foreground">Warranty</dt>
						<dd>
							{#if u.warranty.state === 'none'}
								None recorded for this item
							{:else if u.warranty.state === 'not_sold'}
								{u.warranty.months} months, from the day it is sold
							{:else}
								{u.warranty.months} months from {day(u.warranty.soldOn)}:
								{u.warranty.state === 'active' ? 'until' : 'ended'}
								{day(u.warranty.until)}
							{/if}
						</dd>
					</div>
					{#if u.soldTo || u.saleDocumentId}
						<div>
							<dt class="text-muted-foreground">Sold to</dt>
							<dd>
								{u.soldTo ?? 'Walk-in customer'}
								{#if u.saleDocumentId}
									·
									<a
										class="underline"
										href={resolve('/dashboard/stock/documents/[id]', {
											id: String(u.saleDocumentId)
										})}>{u.saleNumber ?? `#${u.saleDocumentId}`}</a
									>
								{/if}
							</dd>
						</div>
					{/if}
				</dl>

				<div class="overflow-x-auto">
					<table class="w-full text-sm">
						<thead class="text-left text-muted-foreground">
							<tr>
								<th class="py-1 pr-4 font-medium">Date</th>
								<th class="py-1 pr-4 font-medium">What happened</th>
								<th class="py-1 pr-4 font-medium">Where</th>
								<th class="py-1 pr-4 font-medium">From / to</th>
								<th class="py-1 font-medium">Document</th>
							</tr>
						</thead>
						<tbody>
							{#each u.events as e (e.id)}
								<tr class="border-t">
									<td class="py-1 pr-4 whitespace-nowrap">{day(e.day)}</td>
									<td class="py-1 pr-4">{kindName(e.kind)}</td>
									<td class="py-1 pr-4">{e.location}</td>
									<td class="py-1 pr-4">{e.who ?? ''}</td>
									<td class="py-1">
										<a
											class="underline"
											href={resolve('/dashboard/stock/documents/[id]', {
												id: String(e.documentId)
											})}>{e.documentNumber ?? `#${e.documentId}`}</a
										>
									</td>
								</tr>
							{:else}
								<tr
									><td colspan="5" class="py-1 text-muted-foreground">No movements recorded.</td
									></tr
								>
							{/each}
						</tbody>
					</table>
				</div>
			</Card.Content>
		</Card.Root>
	{/each}
</div>
