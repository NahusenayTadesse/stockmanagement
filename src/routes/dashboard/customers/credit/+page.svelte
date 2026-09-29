<script lang="ts">
	import { ethiopianDay } from '$lib/format';
	import PageHeader from '@nahu/admin-kit/components/PageHeader.svelte';
	import PostButton from '$lib/components/PostButton.svelte';
	import MessageSquare from '@lucide/svelte/icons/message-square';
	import DataTable from '@nahu/admin-kit/components/Table/data-table.svelte';
	import ReportChart from '@nahu/admin-kit/components/reports/ReportChart.svelte';
	import StatCard from '$lib/components/StatCard.svelte';
	import type { ReportChartData, Stat } from '@nahu/admin-kit/components/reports/types';
	import { columns } from './columns';
	import { m } from '$lib/paraglide/messages.js';

	let { data } = $props();

	const owed = $derived(data.rows.reduce((s, r) => s + Math.max(0, r.balance), 0));
	const overdue = $derived(data.rows.reduce((s, r) => s + r.overdue, 0));
	const overLimit = $derived(data.rows.filter((r) => r.overLimit).length);

	const tiles = $derived<Stat[]>([
		{
			key: 'owed',
			label: m.sales_owed_to_you(),
			value: owed,
			format: 'money',
			group: 'credit',
			hint: m.sales_customers_count({ count: data.rows.filter((r) => r.balance > 0).length }),
			tone: 'warning'
		},
		{
			key: 'overdue',
			label: m.sales_overdue(),
			value: overdue,
			format: 'money',
			group: 'credit',
			hint: owed
				? m.sales_percent_of_owed({ percent: Math.round((overdue / owed) * 100) })
				: undefined,
			tone: overdue > 0 ? 'negative' : 'neutral'
		},
		{
			key: 'over',
			label: m.sales_over_their_limit(),
			value: overLimit,
			format: 'count',
			group: 'credit',
			hint: m.sales_owing_more(),
			tone: overLimit ? 'negative' : 'neutral'
		}
	]);

	/** One series, the five ages in order: the colour of a bar says nothing the axis does not. */
	const chart = $derived<ReportChartData>({
		key: 'ageing',
		title: m.sales_owed_by_lateness(),
		description: m.sales_oldest_first(),
		group: 'credit',
		kind: 'bar',
		money: true,
		labels: data.buckets.map((b) => b.label),
		series: [{ label: m.sales_owed(), data: data.buckets.map((b) => data.totals[b.key]) }]
	});
	const overdueCount = $derived(data.rows.filter((r) => r.overdue > 0 && r.isActive).length);
</script>

<div class="flex flex-col gap-6">
	<PageHeader
		title={m.nav_credit()}
		description={m.sales_credit_intro({
			date: ethiopianDay(data.today)
		})}
	>
		{#snippet actions()}
			{#if data.canText && overdueCount}
				<PostButton
					action="?/remindAll"
					icon={MessageSquare}
					label={m.sales_text_reminders({ count: overdueCount })}
					busyLabel={m.common_sending()}
				/>
			{/if}
		{/snippet}
	</PageHeader>

	<div class="grid gap-4 sm:grid-cols-3">
		{#each tiles as stat (stat.key)}<StatCard {stat} />{/each}
	</div>

	<div class="grid gap-4 lg:grid-cols-2">
		<ReportChart {chart} />
	</div>

	{#if data.rows.length}
		<DataTable
			data={data.rows}
			{columns}
			variant="list"
			fileName={m.sales_ageing_file({ date: data.today })}
		/>
	{:else}
		<p class="rounded-md border p-6 text-center text-muted-foreground">
			{m.sales_nobody_owes()}
		</p>
	{/if}
</div>
