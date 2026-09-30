<script lang="ts">
	import { resolve } from '$app/paths';
	import PageHeader from '@nahu/admin-kit/components/PageHeader.svelte';
	import PageSection from '@nahu/admin-kit/components/PageSection.svelte';
	import Notice from '@nahu/admin-kit/components/Notice.svelte';
	import DataTable from '@nahu/admin-kit/components/Table/data-table.svelte';
	import { Button } from '@nahu/admin-kit/components/ui/button/index.js';
	import type { Stat } from '@nahu/admin-kit/components/reports/types';
	import StatCard from '$lib/components/StatCard.svelte';
	import { businessColumns } from './businessColumns';
	import { m } from '$lib/paraglide/messages.js';

	let { data } = $props();
	const s = $derived(data.stats);

	const tiles = $derived<Stat[]>([
		{
			key: 'businesses',
			label: m.platform_stat_businesses(),
			value: s.businesses,
			format: 'count',
			group: 'platform',
			hint: m.platform_stat_new({ count: s.newBusinesses })
		},
		{
			key: 'active',
			label: m.platform_stat_paying(),
			value: s.byStatus.active + s.byStatus.due,
			format: 'count',
			group: 'platform',
			tone: 'positive',
			hint: m.platform_stat_trials({ count: s.byStatus.trial })
		},
		{
			key: 'late',
			label: m.platform_stat_late(),
			value: s.byStatus.due + s.byStatus.blocked,
			format: 'count',
			group: 'platform',
			tone: s.byStatus.due + s.byStatus.blocked ? 'warning' : 'neutral',
			hint: m.platform_stat_blocked({ count: s.byStatus.blocked + s.byStatus.suspended })
		},
		{
			key: 'paid',
			label: m.platform_stat_paid_30(),
			value: s.paidLast30Days,
			format: 'money',
			group: 'platform',
			tone: 'positive',
			hint: m.platform_stat_payments({ count: s.paymentsLast30Days })
		}
	]);

	const columns = businessColumns({ brief: true });
</script>

<div class="flex flex-col gap-6">
	<PageHeader title={m.platform_title()} description={m.platform_intro()} />

	{#if s.pendingReceipts}
		<Notice tone="warning" title={m.platform_receipts_title()}>
			{m.platform_receipts_waiting({ count: s.pendingReceipts })}
			{#snippet actions()}
				<Button size="sm" variant="outline" href={resolve('/admin/payments')}>
					{m.platform_receipts_check()}
				</Button>
			{/snippet}
		</Notice>
	{/if}
	{#if s.newMessages}
		<Notice tone="info" title={m.platform_nav_messages()}>
			{m.platform_messages_waiting({ count: s.newMessages })}
			{#snippet actions()}
				<Button size="sm" variant="outline" href={resolve('/admin/messages')}>
					{m.platform_messages_read()}
				</Button>
			{/snippet}
		</Notice>
	{/if}

	<div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
		{#each tiles as stat (stat.key)}<StatCard {stat} />{/each}
	</div>

	<PageSection title={m.platform_attention_title()} hint={m.platform_attention_hint()}>
		{#if s.attention.length}
			<DataTable
				data={s.attention}
				{columns}
				variant="compact"
				fileName={m.platform_attention_title()}
			/>
		{:else}
			<Notice tone="success">{m.platform_attention_none()}</Notice>
		{/if}
		{#snippet actions()}
			<Button size="sm" variant="outline" href={resolve('/admin/businesses')}>
				{m.platform_all_businesses()}
			</Button>
		{/snippet}
	</PageSection>
</div>
