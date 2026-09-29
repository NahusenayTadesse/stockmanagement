<script lang="ts">
	import { resolve } from '$app/paths';
	import DataTable from '@nahu/admin-kit/components/Table/data-table.svelte';
	import ReportChart from '@nahu/admin-kit/components/reports/ReportChart.svelte';
	import StatCard from '@nahu/admin-kit/components/reports/StatCard.svelte';
	import type { ReportChartData, Stat } from '@nahu/admin-kit/components/reports/types';
	import { Label } from '@nahu/admin-kit/components/ui/label/index.js';
	import { qty } from '$lib/format';
	import ReportFilterBar from '../ReportFilterBar.svelte';
	import { columns } from './columns';

	let { data } = $props();

	const select = 'h-9 rounded-md border bg-background px-2 text-sm';
	const t = $derived(data.trend);
	const unit = $derived(t?.item.unit ?? '');
	const GRAINS = [
		{ value: 'day', name: 'Day by day' },
		{ value: 'week', name: 'Week by week' },
		{ value: 'month', name: 'Ethiopian month' }
	];

	const chart = $derived.by<ReportChartData | null>(() => {
		if (!t) return null;
		const flat = (v: number | null) => t.buckets.map(() => v ?? 0);
		const series = [{ label: `On hand (${unit})`, data: t.buckets.map((b) => b.closing) }];
		if (t.lines) {
			series.push({
				label: t.lines.source === 'location' ? 'Minimum' : 'Reorder level',
				data: flat(t.lines.min)
			});
			if (t.lines.max !== null) series.push({ label: 'Maximum', data: flat(t.lines.max) });
		}
		return {
			key: 'trend',
			title: `${t.item.name} on hand`,
			description: 'The level at the end of each period',
			group: 'trend',
			kind: 'line',
			wide: true,
			labels: t.buckets.map((b) => b.label),
			series
		};
	});

	const tiles = $derived<Stat[]>(
		t
			? [
					{
						key: 'open',
						label: `Opening (${unit})`,
						value: t.opening,
						format: 'count',
						group: 'trend'
					},
					{
						key: 'in',
						label: `In (${unit})`,
						value: t.totalIn,
						format: 'count',
						group: 'trend',
						tone: 'positive'
					},
					{
						key: 'out',
						label: `Out (${unit})`,
						value: t.totalOut,
						format: 'count',
						group: 'trend'
					},
					{
						key: 'close',
						label: `Closing (${unit})`,
						value: t.closing,
						format: 'count',
						group: 'trend',
						tone: t.lines && t.closing <= t.lines.min ? 'warning' : 'neutral',
						hint: `Lowest: ${qty(t.low, unit)}`
					}
				]
			: []
	);
</script>

<svelte:head>
	<title>Stock trend</title>
</svelte:head>

<div class="flex flex-col gap-6">
	<div>
		<h1 class="text-2xl font-semibold">Stock trend</h1>
		<p class="text-muted-foreground">
			How much of one item was on hand over time, rebuilt from every movement: what it held before
			the period, then what came in and went out. Drawn against its reorder level, or a location's
			minimum and maximum when one location is chosen.
		</p>
	</div>

	<ReportFilterBar
		branches={data.branches}
		locations={data.locations}
		branchId={data.branchId}
		locationId={data.locationId}
		from={data.from}
		to={data.to}
	>
		<div class="flex flex-col gap-1">
			<Label for="item">Item</Label>
			<select id="item" name="item" class="{select} max-w-72" value={data.itemId}>
				<option value={0}>— Choose an item —</option>
				{#each data.items as i (i.value)}
					<option value={i.value}>{i.name}</option>
				{/each}
			</select>
		</div>
		<div class="flex flex-col gap-1">
			<Label for="grain">Show</Label>
			<select id="grain" name="grain" class={select} value={data.grain}>
				{#each GRAINS as g (g.value)}
					<option value={g.value}>{g.name}</option>
				{/each}
			</select>
		</div>
	</ReportFilterBar>

	{#if t && chart}
		<p class="text-sm">
			<a class="underline" href={resolve('/dashboard/items/[id]', { id: String(t.item.id) })}
				>{t.item.name} ({t.item.sku})</a
			>
		</p>
		<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
			{#each tiles as stat (stat.key)}<StatCard {stat} />{/each}
		</div>
		<ReportChart {chart} />
		<DataTable
			data={t.buckets}
			columns={columns(unit)}
			fileName="{t.item.name} stock {data.from} to {data.to}"
			search={false}
			height="auto"
		/>
	{:else}
		<p class="text-muted-foreground">Choose an item to see its stock over time.</p>
	{/if}
</div>
