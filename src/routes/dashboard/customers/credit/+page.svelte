<script lang="ts">
	import { enhance } from '$app/forms';
	import MessageSquare from '@lucide/svelte/icons/message-square';
	import { Button } from '@nahu/admin-kit/components/ui/button/index.js';
	import DataTable from '@nahu/admin-kit/components/Table/data-table.svelte';
	import ReportChart from '@nahu/admin-kit/components/reports/ReportChart.svelte';
	import StatCard from '@nahu/admin-kit/components/reports/StatCard.svelte';
	import type { ReportChartData, Stat } from '@nahu/admin-kit/components/reports/types';
	import { formatEthiopianDate } from '@nahu/admin-kit/global';
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
	let reminding = $state(false);
	const overdueCount = $derived(data.rows.filter((r) => r.overdue > 0 && r.isActive).length);
</script>

<svelte:head>
	<title>{m.nav_credit()}</title>
</svelte:head>

<div class="flex flex-col gap-6">
	<div class="flex flex-wrap items-start justify-between gap-4">
		<div>
			<h1 class="text-2xl font-semibold">{m.nav_credit()}</h1>
			<p class="text-muted-foreground">
				{m.sales_credit_intro({
					date: formatEthiopianDate(new Date(`${data.today}T12:00:00+03:00`))
				})}
			</p>
		</div>
		{#if data.canText && overdueCount}
			<form
				method="POST"
				action="?/remindAll"
				use:enhance={() => {
					reminding = true;
					return async ({ update }) => {
						await update();
						reminding = false;
					};
				}}
			>
				<Button type="submit" variant="outline" disabled={reminding}>
					<MessageSquare />
					{reminding ? m.common_sending() : m.sales_text_reminders({ count: overdueCount })}
				</Button>
			</form>
		{/if}
	</div>

	<div class="grid gap-4 sm:grid-cols-3">
		{#each tiles as stat (stat.key)}<StatCard {stat} />{/each}
	</div>

	<div class="grid gap-4 lg:grid-cols-2">
		<ReportChart {chart} />
	</div>

	{#if data.rows.length}
		<DataTable data={data.rows} {columns} fileName={m.sales_ageing_file({ date: data.today })} />
	{:else}
		<p class="rounded-md border p-6 text-center text-muted-foreground">
			{m.sales_nobody_owes()}
		</p>
	{/if}
</div>
