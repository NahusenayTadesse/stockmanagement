<script lang="ts">
	import { resolve } from '$app/paths';
	import DataTable from '@nahu/admin-kit/components/Table/data-table.svelte';
	import ReportChart from '@nahu/admin-kit/components/reports/ReportChart.svelte';
	import StatCard from '@nahu/admin-kit/components/reports/StatCard.svelte';
	import type { ReportChartData, Stat } from '@nahu/admin-kit/components/reports/types';
	import { Label } from '@nahu/admin-kit/components/ui/label/index.js';
	import { choices, qty } from '$lib/format';
	import ReportFilterBar from '../ReportFilterBar.svelte';
	import { columns } from './columns';
	import { m } from '$lib/paraglide/messages.js';

	let { data } = $props();

	const select = 'h-9 rounded-md border bg-background px-2 text-sm';
	const t = $derived(data.trend);
	const unit = $derived(t?.item.unit ?? '');
	const GRAINS = choices([
		['day', m.reports_grain_day],
		['week', m.reports_grain_week],
		['month', m.reports_grain_month]
	]);

	const chart = $derived.by<ReportChartData | null>(() => {
		if (!t) return null;
		const flat = (v: number | null) => t.buckets.map(() => v ?? 0);
		const series = [
			{ label: m.reports_trend_on_hand({ unit }), data: t.buckets.map((b) => b.closing) }
		];
		if (t.lines) {
			series.push({
				label:
					t.lines.source === 'location' ? m.reports_trend_minimum() : m.reports_trend_reorder(),
				data: flat(t.lines.min)
			});
			if (t.lines.max !== null) {
				series.push({ label: m.reports_trend_maximum(), data: flat(t.lines.max) });
			}
		}
		return {
			key: 'trend',
			title: m.reports_trend_chart({ name: t.item.name }),
			description: m.reports_trend_chart_desc(),
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
						label: m.reports_trend_opening({ unit }),
						value: t.opening,
						format: 'count',
						group: 'trend'
					},
					{
						key: 'in',
						label: m.reports_trend_in({ unit }),
						value: t.totalIn,
						format: 'count',
						group: 'trend',
						tone: 'positive'
					},
					{
						key: 'out',
						label: m.reports_trend_out({ unit }),
						value: t.totalOut,
						format: 'count',
						group: 'trend'
					},
					{
						key: 'close',
						label: m.reports_trend_closing({ unit }),
						value: t.closing,
						format: 'count',
						group: 'trend',
						tone: t.lines && t.closing <= t.lines.min ? 'warning' : 'neutral',
						hint: m.reports_trend_lowest({ qty: qty(t.low, unit) })
					}
				]
			: []
	);
</script>

<svelte:head>
	<title>{m.nav_trend()}</title>
</svelte:head>

<div class="flex flex-col gap-6">
	<div>
		<h1 class="text-2xl font-semibold">{m.nav_trend()}</h1>
		<p class="text-muted-foreground">{m.reports_trend_intro()}</p>
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
			<Label for="item">{m.common_item()}</Label>
			<select id="item" name="item" class="{select} max-w-72" value={data.itemId}>
				<option value={0}>{m.reports_choose_item()}</option>
				{#each data.items as i (i.value)}
					<option value={i.value}>{i.name}</option>
				{/each}
			</select>
		</div>
		<div class="flex flex-col gap-1">
			<Label for="grain">{m.reports_trend_show()}</Label>
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
			fileName={m.reports_file_trend({ name: t.item.name, from: data.from, to: data.to })}
			search={false}
			height="auto"
		/>
	{:else}
		<p class="text-muted-foreground">{m.reports_trend_empty()}</p>
	{/if}
</div>
