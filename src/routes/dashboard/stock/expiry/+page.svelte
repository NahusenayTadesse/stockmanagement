<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import Mail from '@lucide/svelte/icons/mail';
	import ShieldAlert from '@lucide/svelte/icons/shield-alert';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import { Badge } from '@nahu/admin-kit/components/ui/badge/index.js';
	import { Button } from '@nahu/admin-kit/components/ui/button/index.js';
	import { formatETB, formatEthiopianDate } from '@nahu/admin-kit/global';
	import { qty } from '$lib/format';

	let { data } = $props();

	type Row = (typeof data.rows)[number];
	const key = (r: Row) => `${r.lotId}:${r.locationId}`;

	let band = $state<'all' | 'expired' | 'soon' | 'later'>('all');
	let picked = $state<Record<string, boolean>>({});
	let busy = $state(false);

	const shown = $derived(band === 'all' ? data.rows : data.rows.filter((r) => r.band === band));
	const sum = (rows: Row[]) => rows.reduce((s, r) => s + r.value, 0);
	const expiredOut = $derived(
		data.rows.filter((r) => r.band === 'expired' && r.locationKind !== 'quarantine')
	);
	const soon = $derived(data.rows.filter((r) => r.band === 'soon'));
	const later = $derived(data.rows.filter((r) => r.band === 'later'));
	const chosen = $derived(shown.filter((r) => picked[key(r)]));
	const allTicked = $derived(shown.length > 0 && shown.every((r) => picked[key(r)]));

	const day = (d: string) => formatEthiopianDate(new Date(`${d}T12:00:00+03:00`));
	const when = (r: Row) =>
		r.days < 0
			? `expired ${-r.days} day${r.days === -1 ? '' : 's'} ago`
			: r.days === 0
				? 'expires today'
				: `in ${r.days} day${r.days === 1 ? '' : 's'}`;

	const submitting = () => {
		busy = true;
		return async ({ update }: { update: () => Promise<void> }) => {
			await update();
			busy = false;
		};
	};
</script>

<svelte:head>
	<title>Expiry follow-up</title>
</svelte:head>

<div class="flex flex-col gap-4">
	<div class="flex flex-wrap items-start justify-between gap-2">
		<div>
			<h1 class="text-2xl font-semibold">Expiry follow-up</h1>
			<p class="text-muted-foreground">
				Lots that have expired or will within their category's warning period, where they are, and
				what they are worth at cost. Expired stock is never sold or issued; move it to quarantine or
				write it off.
			</p>
		</div>
		<form method="POST" action="?/emailMe" use:enhance={submitting}>
			<Button type="submit" variant="outline" disabled={busy}><Mail /> Email me this list</Button>
		</form>
	</div>

	<div class="grid gap-4 sm:grid-cols-3">
		<button
			type="button"
			class="rounded-lg border p-4 text-left {band === 'expired' ? 'ring-2 ring-destructive' : ''}"
			onclick={() => (band = band === 'expired' ? 'all' : 'expired')}
		>
			<p class="text-sm text-muted-foreground">Expired, not in quarantine</p>
			<p class="text-2xl font-semibold text-destructive">{expiredOut.length}</p>
			<p class="text-sm text-muted-foreground">{formatETB(sum(expiredOut))} at cost</p>
		</button>
		<button
			type="button"
			class="rounded-lg border p-4 text-left {band === 'soon' ? 'ring-2 ring-amber-500' : ''}"
			onclick={() => (band = band === 'soon' ? 'all' : 'soon')}
		>
			<p class="text-sm text-muted-foreground">Expire within 30 days</p>
			<p class="text-2xl font-semibold text-amber-600">{soon.length}</p>
			<p class="text-sm text-muted-foreground">{formatETB(sum(soon))} at cost</p>
		</button>
		<button
			type="button"
			class="rounded-lg border p-4 text-left {band === 'later' ? 'ring-2 ring-primary' : ''}"
			onclick={() => (band = band === 'later' ? 'all' : 'later')}
		>
			<p class="text-sm text-muted-foreground">Later, within the warning period</p>
			<p class="text-2xl font-semibold">{later.length}</p>
			<p class="text-sm text-muted-foreground">{formatETB(sum(later))} at cost</p>
		</button>
	</div>

	{#if !shown.length}
		<p class="rounded-md border p-6 text-center text-muted-foreground">
			Nothing here. Lots appear on this page once they come within their category's expiry warning
			period.
		</p>
	{:else}
		<form method="POST" action="?/draft" use:enhance={submitting} class="flex flex-col gap-3">
			<div class="overflow-x-auto rounded-md border">
				<table class="w-full text-sm">
					<thead class="bg-muted/50 text-left">
						<tr>
							<th class="w-10 px-3 py-2">
								{#if data.canDraft}
									<input
										type="checkbox"
										class="size-4"
										aria-label="Tick all"
										checked={allTicked}
										onchange={(e) => {
											for (const r of shown) picked[key(r)] = e.currentTarget.checked;
										}}
									/>
								{/if}
							</th>
							<th class="px-3 py-2">Item</th>
							<th class="px-3 py-2">Lot</th>
							<th class="px-3 py-2">Expiry</th>
							<th class="px-3 py-2">Where</th>
							<th class="px-3 py-2 text-right">Quantity</th>
							<th class="px-3 py-2 text-right">Value</th>
							<th class="px-3 py-2"></th>
						</tr>
					</thead>
					<tbody>
						{#each shown as r (key(r))}
							<tr
								class="border-t {r.band === 'expired'
									? 'bg-destructive/5'
									: r.band === 'soon'
										? 'bg-amber-500/5'
										: ''}"
							>
								<td class="px-3 py-2">
									{#if data.canDraft}
										<input
											type="checkbox"
											name="pick"
											value={key(r)}
											bind:checked={picked[key(r)]}
											aria-label="Pick {r.item} lot {r.lotNumber} at {r.location}"
											class="size-4"
										/>
									{/if}
								</td>
								<td class="px-3 py-2">
									<a
										class="font-medium underline-offset-4 hover:underline"
										href={resolve('/dashboard/items/[id]', { id: String(r.itemId) })}>{r.item}</a
									>
									<p class="text-xs text-muted-foreground">
										{r.sku}{r.category ? ` · ${r.category}` : ''}
									</p>
								</td>
								<td class="px-3 py-2">{r.lotNumber}</td>
								<td class="px-3 py-2">
									<p>{day(r.expiryDate!)}</p>
									<p
										class="text-xs {r.band === 'expired'
											? 'font-medium text-destructive'
											: 'text-muted-foreground'}"
									>
										{when(r)}
									</p>
								</td>
								<td class="px-3 py-2">
									{r.location}
									{#if r.locationKind === 'quarantine'}<Badge variant="outline">quarantine</Badge
										>{/if}
									{#if r.lotStatus !== 'available'}<Badge variant="secondary">{r.lotStatus}</Badge
										>{/if}
									<p class="text-xs text-muted-foreground">{r.branch}</p>
								</td>
								<td class="px-3 py-2 text-right">{qty(r.quantity, r.unit)}</td>
								<td class="px-3 py-2 text-right">{formatETB(r.value)}</td>
								<td class="px-3 py-2">
									{#if r.draftId}
										<a
											class="text-xs text-primary underline-offset-4 hover:underline"
											href={resolve('/dashboard/stock/documents/[id]', { id: String(r.draftId) })}
											>Draft #{r.draftId}</a
										>
									{/if}
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>

			{#if data.canDraft}
				<div
					class="sticky bottom-0 flex flex-wrap items-center gap-3 rounded-md border bg-background p-3 shadow-sm"
				>
					<p class="text-sm text-muted-foreground">
						{chosen.length} ticked · {formatETB(sum(chosen))} at cost. The whole quantity at each place
						is drafted.
					</p>
					<div class="ml-auto flex flex-wrap gap-2">
						<Button
							type="submit"
							name="action"
							value="quarantine"
							variant="outline"
							disabled={busy || !chosen.length}
						>
							<ShieldAlert /> Draft move to quarantine
						</Button>
						<Button
							type="submit"
							name="action"
							value="writeoff"
							variant="destructive"
							disabled={busy || !chosen.length}
						>
							<Trash2 /> Draft write-off
						</Button>
					</div>
				</div>
			{/if}
		</form>
	{/if}
</div>
