<script lang="ts">
	import { m } from '$lib/paraglide/messages.js';
	import { resolve } from '$app/paths';
	import StatCard from '@nahu/admin-kit/components/reports/StatCard.svelte';
	import ExpiryCell from '@nahu/admin-kit/components/Table/expiry-cell.svelte';
	import * as Card from '@nahu/admin-kit/components/ui/card/index.js';
	import { Badge } from '@nahu/admin-kit/components/ui/badge/index.js';
	import { formatEthiopianDate } from '@nahu/admin-kit/global';
	import type { Stat } from '@nahu/admin-kit/components/reports/types';
	import { DOCUMENT_LABELS, DOCUMENT_STATUS_LABELS, qty } from '$lib/format';

	let { data } = $props();

	const stats = $derived(data.stats);

	const moneyTiles = $derived<Stat[]>(
		data.money
			? [
					{
						key: 'in',
						label: m.admin_home_money_in(),
						value: data.money.moneyIn,
						format: 'money',
						group: 'money',
						tone: 'positive'
					},
					{
						key: 'out',
						label: m.admin_home_money_out(),
						value: data.money.moneyOut,
						format: 'money',
						group: 'money',
						tone: 'negative'
					},
					{
						key: 'net',
						label: m.admin_home_net(),
						value: data.money.net,
						format: 'money',
						group: 'money',
						tone: data.money.net >= 0 ? 'positive' : 'negative'
					},
					{
						key: 'unverified',
						label: m.admin_home_unverified(),
						value: data.money.unverified,
						format: 'count',
						group: 'money',
						hint: m.admin_home_unverified_hint(),
						tone: data.money.unverified ? 'warning' : 'neutral'
					}
				]
			: []
	);

	const creditTiles = $derived<Stat[]>(
		data.credit
			? [
					{
						key: 'owed',
						label: m.admin_home_owed(),
						value: data.credit.owed,
						format: 'money',
						group: 'credit',
						hint: m.admin_home_debtors({ count: data.credit.debtors }),
						tone: 'warning'
					},
					{
						key: 'overdue',
						label: m.admin_home_overdue(),
						value: data.credit.overdue,
						format: 'money',
						group: 'credit',
						tone: data.credit.overdue ? 'negative' : 'neutral'
					},
					{
						key: 'overLimit',
						label: m.admin_home_over_limit(),
						value: data.credit.overLimit,
						format: 'count',
						group: 'credit',
						tone: data.credit.overLimit ? 'negative' : 'neutral'
					}
				]
			: []
	);

	const attentionTiles = $derived<Stat[]>([
		...(data.attention.approvals
			? [
					{
						key: 'approvals',
						label: m.admin_home_approvals(),
						value: data.attention.approvals,
						format: 'count' as const,
						group: 'attention',
						hint: m.admin_home_approvals_hint(),
						tone: 'warning' as const
					}
				]
			: []),
		...(data.attention.inTransit
			? [
					{
						key: 'transit',
						label: m.admin_home_in_transit(),
						value: data.attention.inTransit,
						format: 'count' as const,
						group: 'attention',
						hint: m.admin_home_in_transit_hint(),
						tone: 'neutral' as const
					}
				]
			: [])
	]);

	const tiles = $derived<Stat[]>(
		stats
			? [
					{
						key: 'value',
						label: m.admin_home_stock_value(),
						value: stats.stockValue,
						format: 'money',
						group: 'stock',
						hint: m.admin_home_stock_value_hint(),
						tone: 'neutral'
					},
					{
						key: 'items',
						label: m.common_items(),
						value: stats.itemCount,
						format: 'count',
						group: 'stock',
						hint: m.admin_home_items_hint()
					},
					{
						key: 'expiring',
						label: m.admin_home_expiring(),
						value: stats.expiringSoonCount,
						format: 'count',
						group: 'stock',
						hint: m.admin_home_expiring_hint(),
						tone: stats.expiringSoonCount ? 'warning' : 'neutral'
					},
					{
						key: 'expired',
						label: m.admin_home_expired(),
						value: stats.expiredCount,
						format: 'count',
						group: 'stock',
						hint: m.admin_home_expired_hint(),
						tone: stats.expiredCount ? 'negative' : 'neutral'
					},
					{
						key: 'low',
						label: m.admin_home_low(),
						value: stats.lowStock.length,
						format: 'count',
						group: 'stock',
						tone: stats.lowStock.length ? 'warning' : 'neutral'
					},
					{
						key: 'drafts',
						label: m.admin_home_drafts(),
						value: stats.draftCount,
						format: 'count',
						group: 'stock',
						hint: m.admin_home_drafts_hint()
					}
				]
			: []
	);
</script>

<svelte:head>
	<title>{m.common_dashboard()}</title>
</svelte:head>

<div class="flex flex-col gap-6">
	<h1 class="text-2xl font-semibold">{data.organization?.name}</h1>

	{#if data.money}
		<div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
			{#each moneyTiles as stat (stat.key)}
				<a
					href="{resolve('/dashboard/transactions')}?from={data.money.from}&to={data.money.to}"
					class="block"
				>
					<StatCard {stat} />
				</a>
			{/each}
		</div>
	{/if}

	{#if attentionTiles.length}
		<div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
			{#each attentionTiles as stat (stat.key)}
				<a
					href={stat.key === 'approvals'
						? resolve('/dashboard/approvals')
						: resolve('/dashboard/stock/transfers')}
					class="block"><StatCard {stat} /></a
				>
			{/each}
		</div>
	{/if}

	{#if data.credit && (data.credit.owed > 0 || data.credit.overLimit > 0)}
		<div class="grid gap-4 sm:grid-cols-3">
			{#each creditTiles as stat (stat.key)}
				<a href={resolve('/dashboard/customers/credit')} class="block"><StatCard {stat} /></a>
			{/each}
		</div>
	{/if}

	{#if !stats}
		<p class="text-muted-foreground">
			{m.admin_home_no_stock_role({ name: data.user.name })}
		</p>
	{:else}
		<div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
			{#each tiles as stat (stat.key)}
				<StatCard {stat} />
			{/each}
		</div>

		<div class="grid gap-6 xl:grid-cols-2">
			<Card.Root>
				<Card.Header>
					<Card.Title>{m.admin_home_expiry()}</Card.Title>
					<Card.Description>{m.admin_home_expiry_desc()}</Card.Description>
				</Card.Header>
				<Card.Content>
					{#if stats.expiring.length === 0}
						<p class="text-muted-foreground">{m.admin_home_nothing_expiring()}</p>
					{:else}
						<ul class="divide-y">
							{#each stats.expiring as row (row.lotId)}
								<li class="flex flex-wrap items-center justify-between gap-2 py-2">
									<div>
										<a
											class="font-medium hover:underline"
											href={resolve('/dashboard/items/[id]', { id: String(row.itemId) })}
										>
											{row.item}
										</a>
										<p class="text-sm text-muted-foreground">
											{m.admin_home_lot({ lot: row.lotNumber })} · {qty(row.onHand, row.unit)}
										</p>
									</div>
									<ExpiryCell expiresOn={row.expiryDate} warningDays={row.warningDays} />
								</li>
							{/each}
						</ul>
					{/if}
				</Card.Content>
			</Card.Root>

			<Card.Root>
				<Card.Header>
					<Card.Title>{m.admin_home_reorder()}</Card.Title>
					<Card.Description>{m.admin_home_reorder_desc()}</Card.Description>
				</Card.Header>
				<Card.Content>
					{#if stats.lowStock.length === 0}
						<p class="text-muted-foreground">{m.admin_home_nothing_reorder()}</p>
					{:else}
						<ul class="divide-y">
							{#each stats.lowStock as row (row.id)}
								<li class="flex items-center justify-between gap-2 py-2">
									<a
										class="font-medium hover:underline"
										href={resolve('/dashboard/items/[id]', { id: String(row.id) })}
									>
										{row.name}
									</a>
									<span class="text-sm">
										{qty(row.onHand, row.unit)}
										<span class="text-muted-foreground"
											>{m.admin_home_reorder_at({ level: qty(row.reorderLevel) })}</span
										>
									</span>
								</li>
							{/each}
						</ul>
					{/if}
				</Card.Content>
			</Card.Root>
		</div>

		<Card.Root>
			<Card.Header>
				<Card.Title>{m.admin_home_latest()}</Card.Title>
			</Card.Header>
			<Card.Content>
				{#if stats.recent.length === 0}
					<p class="text-muted-foreground">
						{m.admin_home_no_docs_before()}
						<a class="underline" href={resolve('/dashboard/stock/documents')}
							>{m.admin_home_no_docs_link()}</a
						>{m.admin_home_no_docs_after()}
					</p>
				{:else}
					<ul class="divide-y">
						{#each stats.recent as doc (doc.id)}
							<li class="flex flex-wrap items-center justify-between gap-2 py-2">
								<a
									class="font-medium hover:underline"
									href={resolve('/dashboard/stock/documents/[id]', { id: String(doc.id) })}
								>
									{doc.number ??
										m.admin_home_draft_doc({ type: DOCUMENT_LABELS[doc.type].toLowerCase() })}
								</a>
								<span class="flex items-center gap-2 text-sm text-muted-foreground">
									{doc.party ?? ''}
									{formatEthiopianDate(new Date(doc.docDate))}
									<Badge variant={doc.status === 'posted' ? 'default' : 'secondary'}>
										{DOCUMENT_STATUS_LABELS[doc.status]}
									</Badge>
								</span>
							</li>
						{/each}
					</ul>
				{/if}
			</Card.Content>
		</Card.Root>
	{/if}
</div>
