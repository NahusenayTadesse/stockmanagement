<script lang="ts">
	import { resolve } from '$app/paths';
	import PageHeader from '@nahu/admin-kit/components/PageHeader.svelte';
	import ReportChart from '@nahu/admin-kit/components/reports/ReportChart.svelte';
	import type { ReportChartData, Stat } from '@nahu/admin-kit/components/reports/types';
	import FilterSelect from '$lib/components/filters/FilterSelect.svelte';
	import { choices, qty } from '$lib/format';
	import ReportFilterBar from '../ReportFilterBar.svelte';
	import ReportTable from '../ReportTable.svelte';
	import StatGrid from '../StatGrid.svelte';
	import { columns } from './columns';
	import { m } from '$lib/paraglide/messages.js';

	let { data } = $props();

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

<div class="flex flex-col gap-6">
	<PageHeader title={m.nav_trend()} description={m.reports_trend_intro()} />

	<ReportFilterBar
		branches={data.branches}
		locations={data.locations}
		branchId={data.branchId}
		locationId={data.locationId}
		from={data.from}
		to={data.to}
	>
		<FilterSelect
			name="item"
			label={m.common_item()}
			value={data.itemId}
			options={data.items}
			anyLabel={m.reports_choose_item()}
			anyValue={0}
		/>
		<FilterSelect
			name="grain"
			label={m.reports_trend_show()}
			value={data.grain}
			options={GRAINS}
			anyLabel={null}
		/>
	</ReportFilterBar>

	{#if t && chart}
		<p class="text-sm">
			<a class="underline" href={resolve('/dashboard/items/[id]', { id: String(t.item.id) })}
				>{t.item.name} ({t.item.sku})</a
			>
		</p>
		<StatGrid stats={tiles} />
		<ReportChart {chart} />
		<ReportTable
			data={t.buckets}
			columns={columns(unit)}
			fileName={m.reports_file_trend({ name: t.item.name, from: data.from, to: data.to })}
			search={false}
		/>
	{:else}
		<p class="text-muted-foreground">{m.reports_trend_empty()}</p>
	{/if}
</div>
