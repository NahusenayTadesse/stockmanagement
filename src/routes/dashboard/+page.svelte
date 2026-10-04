<script lang="ts">
	import { useKit } from '@nahu/admin-kit/context';
	import { Button } from '@nahu/admin-kit/components/ui/button/index.js';
	import type { ColumnDef } from '@tanstack/table-core';
	import { m } from '$lib/paraglide/messages.js';
	import { resolve } from '$app/paths';
	import StatCard from '$lib/components/StatCard.svelte';
	import ExpiryCell from '@nahu/admin-kit/components/Table/expiry-cell.svelte';
	import DataTable from '@nahu/admin-kit/components/Table/data-table.svelte';
	import PageHeader from '@nahu/admin-kit/components/PageHeader.svelte';
	import GettingStarted from '$lib/components/help/GettingStarted.svelte';
	import { renderComponent } from '@nahu/admin-kit/components/ui/data-table/index.js';
	import * as Card from '@nahu/admin-kit/components/ui/card/index.js';
	import type { Stat } from '@nahu/admin-kit/components/reports/types';
	import { DOCUMENT_LABELS, qty } from '$lib/format';
	import { dateCell, longText, NAME_LENGTH, documentStatusCell } from '$lib/table';
	import { recordLink } from '$lib/table';

	let { data } = $props();

	const stats = $derived(data.stats);
	const kit = useKit();
	const stockHref = (key: string) => {
		const paths: Record<string, string> = { value: '/dashboard/stock', items: '/dashboard/items', low: '/dashboard/stock/low', expired: '/dashboard/stock/expiry?status=expired', expiring: '/dashboard/stock/expiry?status=soon', drafts: '/dashboard/stock/documents?status=draft' };
		const path = paths[key] ?? '/dashboard/stock';
		return `${path}${path.includes('?') ? '&' : '?'}branch=${data.selectedBranch}`;
	};
	const quickActions = $derived([
		{ path: '/dashboard/pos', title: m.nav_pos() },
		{ path: '/dashboard/stock/documents', title: m.common_doc_receipt() },
		{ path: '/dashboard/stock/transfers', title: m.common_doc_transfer() },
		{ path: '/dashboard/stock/counts', title: m.nav_counts() }
	].filter((action) => kit.canOpen(action.path)));
	const work = $derived([
		...(stats?.expiredCount ? [{ path: stockHref('expired'), title: m.admin_home_expired(), count: stats.expiredCount }] : []),
		...(data.attention.approvals ? [{ path: '/dashboard/approvals', title: m.admin_home_approvals(), count: data.attention.approvals }] : []),
		...(stats?.lowStockCount ? [{ path: stockHref('low'), title: m.admin_home_low(), count: stats.lowStockCount }] : []),
		...(data.credit?.overdue ? [{ path: '/dashboard/customers/credit?overdue=1', title: m.admin_home_overdue(), count: null }] : []),
		...(data.attention.inTransit ? [{ path: '/dashboard/stock/transfers', title: m.admin_home_in_transit(), count: data.attention.inTransit }] : [])
	]);

	type Stats = NonNullable<typeof stats>;
	const expiringColumns: ColumnDef<Stats['expiring'][number]>[] = [
		{
			accessorKey: 'item',
			header: () => m.common_item(),
			cell: ({ row }) => recordLink('item', row.original.itemId, row.original.item)
		},
		{ accessorKey: 'lotNumber', header: () => m.stock_col_lot() },
		{
			id: 'onHand',
			accessorFn: (r) => qty(r.onHand, r.unit),
			header: () => m.stock_on_hand()
		},
		{
			accessorKey: 'expiryDate',
			header: () => m.stock_col_expiry(),
			cell: ({ row }) =>
				renderComponent(ExpiryCell, {
					expiresOn: row.original.expiryDate,
					warningDays: row.original.warningDays
				})
		}
	];

	const lowStockColumns: ColumnDef<Stats['lowStock'][number]>[] = [
		{
			accessorKey: 'name',
			header: () => m.common_item(),
			cell: ({ row }) => recordLink('item', row.original.id, row.original.name)
		},
		{
			id: 'onHand',
			accessorFn: (r) => qty(r.onHand, r.unit),
			header: () => m.stock_on_hand()
		},
		{
			id: 'reorderLevel',
			accessorFn: (r) => qty(r.reorderLevel),
			header: () => m.stock_reorder_at()
		}
	];

	const recentColumns: ColumnDef<Stats['recent'][number]>[] = [
		{
			id: 'number',
			accessorFn: (doc) =>
				doc.number ?? m.admin_home_draft_doc({ type: DOCUMENT_LABELS[doc.type].toLowerCase() }),
			header: () => m.stock_document(),
			cell: ({ row, getValue }) => recordLink('document', row.original.id, String(getValue()))
		},
		{ accessorKey: 'party', header: () => m.stock_col_party(), cell: longText(NAME_LENGTH) },
		{ accessorKey: 'docDate', header: () => m.common_date(), cell: dateCell },
		{
			accessorKey: 'status',
			header: () => m.common_status(),
			cell: ({ row }) => documentStatusCell(row.original.status)
		}
	];

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
						value: stats.lowStockCount,
						format: 'count',
						group: 'stock',
						tone: stats.lowStockCount ? 'warning' : 'neutral'
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

<div class="flex flex-col gap-6">
	<PageHeader title={data.organization?.name ?? ''} tabTitle={m.common_dashboard()} />

	<form method="GET" class="flex flex-wrap items-end gap-3 rounded-lg border bg-card p-3">
		<label class="flex flex-col gap-1 text-sm">{m.common_branch()}
			<select name="branch" value={data.selectedBranch} class="h-10 rounded border bg-background px-2"><option value={0}>{m.common_all_branches()}</option>{#each data.branches as b (b.value)}<option value={b.value}>{b.name}</option>{/each}</select>
		</label>
		{#if data.money}<label class="flex flex-col gap-1 text-sm">{m.admin_period()}<select name="period" value={data.period} class="h-10 rounded border bg-background px-2">{#each data.periods as p (p.key)}<option value={p.key}>{p.label}</option>{/each}</select></label>{/if}
		<Button type="submit">{m.common_apply()}</Button>
		<p class="text-sm text-muted-foreground">{m.admin_stock_now()}</p>
	</form>
	{#if quickActions.length}<nav aria-label={m.admin_quick_actions()} class="flex flex-wrap gap-2">{#each quickActions as action (action.path)}<Button variant="outline" href={action.path}>{action.title}</Button>{/each}</nav>{/if}
	{#if work.length}<section class="rounded-lg border bg-card p-4" aria-labelledby="attention-title"><h2 id="attention-title">{m.admin_attention()}</h2><ul class="mt-3 grid gap-2 sm:grid-cols-2">{#each work as task (task.path)}<li><a class="flex items-center justify-between gap-2 rounded border p-3 hover:bg-accent" href={task.path}><span>{task.title}</span>{#if task.count !== null}<strong>{task.count}</strong>{/if}</a></li>{/each}</ul></section>{/if}
	{#if data.guide}<GettingStarted guide={data.guide} />{/if}

	{#if data.money}
		<div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
			{#each moneyTiles as stat (stat.key)}
				<a
					href="{resolve('/dashboard/transactions')}?from={data.money.from}&to={data.money.to}&branch={data.selectedBranch}&direction={stat.key === 'in' ? 'in' : stat.key === 'out' ? 'out' : ''}&status={stat.key === 'unverified' ? 'recorded' : ''}"
					class="block"
				>
					<StatCard {stat} />
				</a>
			{/each}
		</div>
	{/if}

	{#if data.credit && (data.credit.owed > 0 || data.credit.overLimit > 0)}
		<p class="text-sm text-muted-foreground">{m.admin_shared_credit()}</p>
		<div class="grid gap-4 sm:grid-cols-3">
			{#each creditTiles as stat (stat.key)}
				<a href="{resolve('/dashboard/customers/credit')}?overdue={stat.key === 'overdue' ? 1 : 0}&overLimit={stat.key === 'overLimit' ? 1 : 0}" class="block"><StatCard {stat} /></a>
			{/each}
		</div>
	{/if}

	{#if !stats}
		<p class="text-muted-foreground">
			{m.admin_home_no_stock_role({ name: data.user.name })}
		</p>
	{:else}
		<p class="text-sm text-muted-foreground">{m.admin_home_stock_scope()}</p>
		<div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
			{#each tiles as stat (stat.key)}
				{#if kit.canOpen(stockHref(stat.key).split('?')[0])}<a href={stockHref(stat.key)}><StatCard {stat} /></a>{:else}<StatCard {stat} />{/if}
			{/each}
		</div>

		<div class="grid gap-6 xl:grid-cols-2">
			<Card.Root>
				<Card.Header>
					<Card.Title>{m.admin_home_expiry()}</Card.Title>
					<a class="text-sm underline" href="/dashboard/stock/expiry?branch={data.selectedBranch}">{m.common_view_all()}</a>
					<Card.Description>{m.admin_home_expiry_desc()}</Card.Description>
				</Card.Header>
				<Card.Content>
					{#if stats.expiring.length === 0}
						<p class="text-muted-foreground">{m.admin_home_nothing_expiring()}</p>
					{:else}
						<p class="mb-3 text-sm text-muted-foreground">
							{m.admin_home_preview_count({
								shown: stats.expiring.length,
								total: stats.expiredCount + stats.expiringSoonCount
							})}
						</p>
						<DataTable variant="compact" data={stats.expiring} columns={expiringColumns} />
					{/if}
				</Card.Content>
			</Card.Root>

			<Card.Root>
				<Card.Header>
					<Card.Title>{m.admin_home_reorder()}</Card.Title>
					<a class="text-sm underline" href={stockHref('low')}>{m.common_view_all()}</a>
					<Card.Description>{m.admin_home_reorder_desc()}</Card.Description>
				</Card.Header>
				<Card.Content>
					{#if stats.lowStock.length === 0}
						<p class="text-muted-foreground">{m.admin_home_nothing_reorder()}</p>
					{:else}
						<p class="mb-3 text-sm text-muted-foreground">
							{m.admin_home_preview_count({
								shown: stats.lowStock.length,
								total: stats.lowStockCount
							})}
						</p>
						<DataTable variant="compact" data={stats.lowStock} columns={lowStockColumns} />
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
					<DataTable variant="compact" data={stats.recent} columns={recentColumns} />
				{/if}
			</Card.Content>
		</Card.Root>
	{/if}
</div>
