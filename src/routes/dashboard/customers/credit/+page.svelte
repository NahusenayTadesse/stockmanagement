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

	let { data } = $props();

	const owed = $derived(data.rows.reduce((s, r) => s + Math.max(0, r.balance), 0));
	const overdue = $derived(data.rows.reduce((s, r) => s + r.overdue, 0));
	const overLimit = $derived(data.rows.filter((r) => r.overLimit).length);

	const tiles = $derived<Stat[]>([
		{
			key: 'owed',
			label: 'Owed to you',
			value: owed,
			format: 'money',
			group: 'credit',
			hint: `${data.rows.filter((r) => r.balance > 0).length} customers`,
			tone: 'warning'
		},
		{
			key: 'overdue',
			label: 'Overdue',
			value: overdue,
			format: 'money',
			group: 'credit',
			hint: owed ? `${Math.round((overdue / owed) * 100)}% of what is owed` : undefined,
			tone: overdue > 0 ? 'negative' : 'neutral'
		},
		{
			key: 'over',
			label: 'Over their limit',
			value: overLimit,
			format: 'count',
			group: 'credit',
			hint: 'Customers owing more than allowed',
			tone: overLimit ? 'negative' : 'neutral'
		}
	]);

	/** One series, the five ages in order: the colour of a bar says nothing the axis does not. */
	const chart = $derived<ReportChartData>({
		key: 'ageing',
		title: 'Owed, by how late it is',
		description: 'Payments are applied to the oldest sales first.',
		group: 'credit',
		kind: 'bar',
		money: true,
		labels: data.buckets.map((b) => b.label),
		series: [{ label: 'Owed', data: data.buckets.map((b) => data.totals[b.key]) }]
	});
	let reminding = $state(false);
	const overdueCount = $derived(data.rows.filter((r) => r.overdue > 0 && r.isActive).length);
</script>

<svelte:head>
	<title>Credit & ageing</title>
</svelte:head>

<div class="flex flex-col gap-6">
	<div class="flex flex-wrap items-start justify-between gap-4">
		<div>
			<h1 class="text-2xl font-semibold">Credit & ageing</h1>
			<p class="text-muted-foreground">
				What customers owe (ዱቤ) as of {formatEthiopianDate(
					new Date(`${data.today}T12:00:00+03:00`)
				)}, and how long it has been owed. A sale is due its customer's days to pay after the sale.
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
					{reminding ? 'Sending…' : `Text reminders to ${overdueCount} overdue`}
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
		<DataTable data={data.rows} {columns} fileName="Receivables ageing {data.today}" />
	{:else}
		<p class="rounded-md border p-6 text-center text-muted-foreground">
			Nobody owes anything. Sales to customers that are not paid when posted show up here.
		</p>
	{/if}
</div>
