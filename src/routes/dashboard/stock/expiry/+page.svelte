<script lang="ts">
	import { m } from '$lib/paraglide/messages.js';
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
			? r.days === -1
				? m.stock_expired_days_ago_one()
				: m.stock_expired_days_ago({ days: -r.days })
			: r.days === 0
				? m.stock_expires_today()
				: r.days === 1
					? m.stock_in_days_one()
					: m.stock_in_days({ days: r.days });

	const submitting = () => {
		busy = true;
		return async ({ update }: { update: () => Promise<void> }) => {
			await update();
			busy = false;
		};
	};
</script>

<svelte:head>
	<title>{m.stock_expiry_title()}</title>
</svelte:head>

<div class="flex flex-col gap-4">
	<div class="flex flex-wrap items-start justify-between gap-2">
		<div>
			<h1 class="text-2xl font-semibold">{m.stock_expiry_title()}</h1>
			<p class="text-muted-foreground">
				{m.stock_expiry_intro()}
			</p>
		</div>
		<form method="POST" action="?/emailMe" use:enhance={submitting}>
			<Button type="submit" variant="outline" disabled={busy}
				><Mail /> {m.stock_email_me_list()}</Button
			>
		</form>
	</div>

	<div class="grid gap-4 sm:grid-cols-3">
		<button
			type="button"
			class="rounded-lg border p-4 text-left {band === 'expired' ? 'ring-2 ring-destructive' : ''}"
			onclick={() => (band = band === 'expired' ? 'all' : 'expired')}
		>
			<p class="text-sm text-muted-foreground">{m.stock_expired_not_quarantine()}</p>
			<p class="text-2xl font-semibold text-destructive">{expiredOut.length}</p>
			<p class="text-sm text-muted-foreground">
				{m.stock_at_cost({ amount: formatETB(sum(expiredOut)) })}
			</p>
		</button>
		<button
			type="button"
			class="rounded-lg border p-4 text-left {band === 'soon' ? 'ring-2 ring-amber-500' : ''}"
			onclick={() => (band = band === 'soon' ? 'all' : 'soon')}
		>
			<p class="text-sm text-muted-foreground">{m.stock_expire_30()}</p>
			<p class="text-2xl font-semibold text-amber-600">{soon.length}</p>
			<p class="text-sm text-muted-foreground">
				{m.stock_at_cost({ amount: formatETB(sum(soon)) })}
			</p>
		</button>
		<button
			type="button"
			class="rounded-lg border p-4 text-left {band === 'later' ? 'ring-2 ring-primary' : ''}"
			onclick={() => (band = band === 'later' ? 'all' : 'later')}
		>
			<p class="text-sm text-muted-foreground">{m.stock_later_warning()}</p>
			<p class="text-2xl font-semibold">{later.length}</p>
			<p class="text-sm text-muted-foreground">
				{m.stock_at_cost({ amount: formatETB(sum(later)) })}
			</p>
		</button>
	</div>

	{#if !shown.length}
		<p class="rounded-md border p-6 text-center text-muted-foreground">
			{m.stock_expiry_nothing()}
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
										aria-label={m.stock_tick_all()}
										checked={allTicked}
										onchange={(e) => {
											for (const r of shown) picked[key(r)] = e.currentTarget.checked;
										}}
									/>
								{/if}
							</th>
							<th class="px-3 py-2">{m.common_item()}</th>
							<th class="px-3 py-2">{m.stock_col_lot()}</th>
							<th class="px-3 py-2">{m.stock_col_expiry()}</th>
							<th class="px-3 py-2">{m.stock_digest_where()}</th>
							<th class="px-3 py-2 text-right">{m.common_quantity()}</th>
							<th class="px-3 py-2 text-right">{m.stock_col_value()}</th>
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
											aria-label={m.stock_pick_aria({
												item: r.item,
												lot: r.lotNumber,
												location: r.location
											})}
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
									{#if r.locationKind === 'quarantine'}<Badge variant="outline"
											>{m.stock_quarantine()}</Badge
										>{/if}
									{#if r.lotStatus !== 'available'}<Badge variant="secondary"
											>{r.lotStatus === 'recalled'
												? m.stock_lot_state_recalled()
												: m.stock_lot_state_quarantine()}</Badge
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
											>{m.stock_draft_number({ id: r.draftId })}</a
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
						{m.stock_ticked_summary({ count: chosen.length, value: formatETB(sum(chosen)) })}
					</p>
					<div class="ml-auto flex flex-wrap gap-2">
						<Button
							type="submit"
							name="action"
							value="quarantine"
							variant="outline"
							disabled={busy || !chosen.length}
						>
							<ShieldAlert />
							{m.stock_draft_quarantine()}
						</Button>
						<Button
							type="submit"
							name="action"
							value="writeoff"
							variant="destructive"
							disabled={busy || !chosen.length}
						>
							<Trash2 />
							{m.stock_draft_writeoff()}
						</Button>
					</div>
				</div>
			{/if}
		</form>
	{/if}
</div>
