<script lang="ts">
	import { resolve } from '$app/paths';
	import StatCard from '@nahu/admin-kit/components/reports/StatCard.svelte';
	import ExpiryCell from '@nahu/admin-kit/components/Table/expiry-cell.svelte';
	import * as Card from '@nahu/admin-kit/components/ui/card/index.js';
	import { Badge } from '@nahu/admin-kit/components/ui/badge/index.js';
	import { formatEthiopianDate } from '@nahu/admin-kit/global';
	import type { Stat } from '@nahu/admin-kit/components/reports/types';
	import { DOCUMENT_LABELS, qty } from '$lib/format';

	let { data } = $props();

	const stats = $derived(data.stats);

	const moneyTiles = $derived<Stat[]>(
		data.money
			? [
					{
						key: 'in',
						label: 'Money in this month',
						value: data.money.moneyIn,
						format: 'money',
						group: 'money',
						tone: 'positive'
					},
					{
						key: 'out',
						label: 'Money out this month',
						value: data.money.moneyOut,
						format: 'money',
						group: 'money',
						tone: 'negative'
					},
					{
						key: 'net',
						label: 'Net this month',
						value: data.money.net,
						format: 'money',
						group: 'money',
						tone: data.money.net >= 0 ? 'positive' : 'negative'
					},
					{
						key: 'unverified',
						label: 'Not yet verified',
						value: data.money.unverified,
						format: 'count',
						group: 'money',
						hint: 'Transactions this month waiting for a check',
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
						label: 'Customers owe you',
						value: data.credit.owed,
						format: 'money',
						group: 'credit',
						hint: `${data.credit.debtors} customer${data.credit.debtors === 1 ? '' : 's'} on credit`,
						tone: 'warning'
					},
					{
						key: 'overdue',
						label: 'Overdue credit',
						value: data.credit.overdue,
						format: 'money',
						group: 'credit',
						tone: data.credit.overdue ? 'negative' : 'neutral'
					},
					{
						key: 'overLimit',
						label: 'Over their credit limit',
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
						label: 'Waiting for approval',
						value: data.attention.approvals,
						format: 'count' as const,
						group: 'attention',
						hint: 'Adjustments, counts and orders over your limits',
						tone: 'warning' as const
					}
				]
			: []),
		...(data.attention.inTransit
			? [
					{
						key: 'transit',
						label: 'Transfers in transit',
						value: data.attention.inTransit,
						format: 'count' as const,
						group: 'attention',
						hint: 'Sent to another branch, not yet received',
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
						label: 'Stock value',
						value: stats.stockValue,
						format: 'money',
						group: 'stock',
						hint: 'At average cost',
						tone: 'neutral'
					},
					{
						key: 'items',
						label: 'Items',
						value: stats.itemCount,
						format: 'count',
						group: 'stock',
						hint: 'In the catalogue'
					},
					{
						key: 'expiring',
						label: 'Lots expiring soon',
						value: stats.expiringSoonCount,
						format: 'count',
						group: 'stock',
						hint: 'Inside their warning window',
						tone: stats.expiringSoonCount ? 'warning' : 'neutral'
					},
					{
						key: 'expired',
						label: 'Expired lots with stock',
						value: stats.expiredCount,
						format: 'count',
						group: 'stock',
						hint: 'Cannot be issued; quarantine or write off',
						tone: stats.expiredCount ? 'negative' : 'neutral'
					},
					{
						key: 'low',
						label: 'At or below reorder level',
						value: stats.lowStock.length,
						format: 'count',
						group: 'stock',
						tone: stats.lowStock.length ? 'warning' : 'neutral'
					},
					{
						key: 'drafts',
						label: 'Draft documents',
						value: stats.draftCount,
						format: 'count',
						group: 'stock',
						hint: 'Waiting to be posted'
					}
				]
			: []
	);
</script>

<svelte:head>
	<title>Dashboard</title>
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
			Welcome, {data.user.name}. Your role does not include viewing stock; use the menu for what it
			does include.
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
					<Card.Title>Expiry</Card.Title>
					<Card.Description>Lots with stock that have expired or will soon.</Card.Description>
				</Card.Header>
				<Card.Content>
					{#if stats.expiring.length === 0}
						<p class="text-muted-foreground">Nothing is close to expiring.</p>
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
											Lot {row.lotNumber} · {qty(row.onHand, row.unit)}
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
					<Card.Title>Reorder</Card.Title>
					<Card.Description>Items at or below their reorder level.</Card.Description>
				</Card.Header>
				<Card.Content>
					{#if stats.lowStock.length === 0}
						<p class="text-muted-foreground">Nothing needs reordering.</p>
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
										<span class="text-muted-foreground">/ reorder at {qty(row.reorderLevel)}</span>
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
				<Card.Title>Latest documents</Card.Title>
			</Card.Header>
			<Card.Content>
				{#if stats.recent.length === 0}
					<p class="text-muted-foreground">
						No documents yet. Start with a <a
							class="underline"
							href={resolve('/dashboard/stock/documents')}>goods receipt</a
						>.
					</p>
				{:else}
					<ul class="divide-y">
						{#each stats.recent as doc (doc.id)}
							<li class="flex flex-wrap items-center justify-between gap-2 py-2">
								<a
									class="font-medium hover:underline"
									href={resolve('/dashboard/stock/documents/[id]', { id: String(doc.id) })}
								>
									{doc.number ?? `Draft ${DOCUMENT_LABELS[doc.type].toLowerCase()}`}
								</a>
								<span class="flex items-center gap-2 text-sm text-muted-foreground">
									{doc.party ?? ''}
									{formatEthiopianDate(new Date(doc.docDate))}
									<Badge variant={doc.status === 'posted' ? 'default' : 'secondary'}>
										{doc.status}
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
