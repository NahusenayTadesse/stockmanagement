<script lang="ts">
	import { m } from '$lib/paraglide/messages.js';
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import Mail from '@lucide/svelte/icons/mail';
	import ShieldAlert from '@lucide/svelte/icons/shield-alert';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import { Badge } from '@nahu/admin-kit/components/ui/badge/index.js';
	import { Button } from '@nahu/admin-kit/components/ui/button/index.js';
	import { formatETB } from '@nahu/admin-kit/global';
	import { ethiopianDay, qty } from '$lib/format';
	import { moneyCell } from '$lib/table';
	import type { ColumnDef } from '@tanstack/table-core';
	import DataTable from '@nahu/admin-kit/components/Table/data-table.svelte';
	import { renderSnippet } from '@nahu/admin-kit/components/ui/data-table/index.js';
	import PageHeader from '@nahu/admin-kit/components/PageHeader.svelte';
	import StatCard from '$lib/components/StatCard.svelte';
	import type { Stat } from '@nahu/admin-kit/components/reports/types';

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

	const day = ethiopianDay;
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

	type Band = 'expired' | 'soon' | 'later';
	const pickBand = (key: string) => (band = band === key ? 'all' : (key as Band));
	const bands = $derived<{ stat: Stat; ring: string }[]>([
		{
			stat: {
				key: 'expired',
				section: 'expired',
				label: m.stock_expired_not_quarantine(),
				value: expiredOut.length,
				hint: m.stock_at_cost({ amount: formatETB(sum(expiredOut)) }),
				format: 'count',
				group: 'expiry',
				tone: 'negative'
			},
			ring: 'ring-destructive'
		},
		{
			stat: {
				key: 'soon',
				section: 'soon',
				label: m.stock_expire_30(),
				value: soon.length,
				hint: m.stock_at_cost({ amount: formatETB(sum(soon)) }),
				format: 'count',
				group: 'expiry',
				tone: 'warning'
			},
			ring: 'ring-amber-500'
		},
		{
			stat: {
				key: 'later',
				section: 'later',
				label: m.stock_later_warning(),
				value: later.length,
				hint: m.stock_at_cost({ amount: formatETB(sum(later)) }),
				format: 'count',
				group: 'expiry'
			},
			ring: 'ring-primary'
		}
	]);

	const columns: ColumnDef<Row>[] = [
		{
			id: 'pick',
			header: () => renderSnippet(tickAll),
			cell: ({ row }) => renderSnippet(tick, row.original)
		},
		{
			accessorKey: 'item',
			header: m.common_item(),
			cell: ({ row }) => renderSnippet(itemCell, row.original)
		},
		{ accessorKey: 'lotNumber', header: m.stock_col_lot() },
		{
			accessorKey: 'expiryDate',
			header: m.stock_col_expiry(),
			cell: ({ row }) => renderSnippet(expiryCell, row.original)
		},
		{
			accessorKey: 'location',
			header: m.stock_digest_where(),
			cell: ({ row }) => renderSnippet(whereCell, row.original)
		},
		{
			accessorKey: 'quantity',
			meta: { align: 'right' },
			header: m.common_quantity(),
			cell: ({ row }) => qty(row.original.quantity, row.original.unit)
		},
		{
			accessorKey: 'value',
			header: m.stock_col_value(),
			cell: moneyCell,
			meta: { align: 'right' }
		},
		{ id: 'draft', header: '', cell: ({ row }) => renderSnippet(draftCell, row.original) }
	];

	const submitting = () => {
		busy = true;
		return async ({ update }: { update: () => Promise<void> }) => {
			await update();
			busy = false;
		};
	};
</script>

{#snippet tickAll()}
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
{/snippet}

{#snippet tick(r: Row)}
	{#if data.canDraft}
		<input
			type="checkbox"
			name="pick"
			value={key(r)}
			bind:checked={picked[key(r)]}
			aria-label={m.stock_pick_aria({ item: r.item, lot: r.lotNumber, location: r.location })}
			class="size-4"
		/>
	{/if}
{/snippet}

{#snippet itemCell(r: Row)}
	<a
		class="font-medium underline-offset-4 hover:underline"
		href={resolve('/dashboard/items/[id]', { id: String(r.itemId) })}>{r.item}</a
	>
	<p class="text-xs text-muted-foreground">{r.sku}{r.category ? ` · ${r.category}` : ''}</p>
{/snippet}

{#snippet expiryCell(r: Row)}
	<p>{day(r.expiryDate!)}</p>
	<p
		class="text-xs {r.band === 'expired'
			? 'font-medium text-destructive'
			: 'text-muted-foreground'}"
	>
		{when(r)}
	</p>
{/snippet}

{#snippet whereCell(r: Row)}
	{r.location}
	{#if r.locationKind === 'quarantine'}<Badge variant="outline">{m.stock_quarantine()}</Badge>{/if}
	{#if r.lotStatus !== 'available'}<Badge variant="secondary"
			>{r.lotStatus === 'recalled'
				? m.stock_lot_state_recalled()
				: m.stock_lot_state_quarantine()}</Badge
		>{/if}
	<p class="text-xs text-muted-foreground">{r.branch}</p>
{/snippet}

{#snippet draftCell(r: Row)}
	{#if r.draftId}
		<a
			class="text-xs text-primary underline-offset-4 hover:underline"
			href={resolve('/dashboard/stock/documents/[id]', { id: String(r.draftId) })}
			>{m.stock_draft_number({ id: r.draftId })}</a
		>
	{/if}
{/snippet}

<div class="flex flex-col gap-4">
	<PageHeader title={m.stock_expiry_title()} description={m.stock_expiry_intro()}>
		{#snippet actions()}
			<form method="POST" action="?/emailMe" use:enhance={submitting}>
				<Button type="submit" variant="outline" disabled={busy}
					><Mail /> {m.stock_email_me_list()}</Button
				>
			</form>
		{/snippet}
	</PageHeader>

	<div class="grid gap-4 sm:grid-cols-3">
		{#each bands as b (b.stat.key)}
			<div class="rounded-xl {band === b.stat.key ? `ring-2 ${b.ring}` : ''}">
				<StatCard stat={b.stat} onselect={pickBand} />
			</div>
		{/each}
	</div>

	{#if !shown.length}
		<p class="rounded-md border p-6 text-center text-muted-foreground">
			{m.stock_expiry_nothing()}
		</p>
	{:else}
		<form method="POST" action="?/draft" use:enhance={submitting} class="flex flex-col gap-3">
			<DataTable
				variant="sheet"
				data={shown}
				{columns}
				rowClass={(r) =>
					r.band === 'expired' ? 'bg-destructive/5' : r.band === 'soon' ? 'bg-amber-500/5' : null}
			/>
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
