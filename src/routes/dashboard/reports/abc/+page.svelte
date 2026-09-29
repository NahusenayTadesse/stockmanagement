<script lang="ts">
	import DataTable from '@nahu/admin-kit/components/Table/data-table.svelte';
	import ReportChart from '@nahu/admin-kit/components/reports/ReportChart.svelte';
	import StatCard from '@nahu/admin-kit/components/reports/StatCard.svelte';
	import type { ReportChartData, Stat } from '@nahu/admin-kit/components/reports/types';
	import { Label } from '@nahu/admin-kit/components/ui/label/index.js';
	import ReportFilterBar from '../ReportFilterBar.svelte';
	import { labels } from '$lib/format';
	import { CLASS_NAMES, columns } from './columns';
	import { m } from '$lib/paraglide/messages.js';

	let { data } = $props();

	const select = 'h-9 rounded-md border bg-background px-2 text-sm';
	const used = $derived(data.basis === 'cost');
	const cols = $derived(columns(data.basis));
	const HINTS: Record<string, string> = labels({
		A: m.reports_abc_hint_a,
		B: m.reports_abc_hint_b,
		C: m.reports_abc_hint_c,
		none: m.reports_abc_hint_none
	});

	const tiles = $derived<Stat[]>(
		data.report.classes.map((c) => ({
			key: c.cls,
			label: (c.items === 1 ? m.reports_abc_tile_one : m.reports_abc_tile_many)({
				cls: CLASS_NAMES[c.cls],
				count: c.items
			}),
			value: c.cls === 'none' ? c.stockValue : c.value,
			format: 'money',
			group: 'abc',
			tone:
				c.cls === 'A' ? 'positive' : c.cls === 'none' && c.stockValue > 0 ? 'warning' : 'neutral',
			hint:
				c.cls === 'none'
					? `${HINTS.none} · ${m.reports_abc_stock_value_suffix()}`
					: `${c.share}% · ${HINTS[c.cls]}`
		}))
	);

	const chart = $derived<ReportChartData>({
		key: 'pareto',
		title: used ? m.reports_abc_chart_used() : m.reports_abc_chart_sales(),
		description: m.reports_abc_chart_desc(),
		group: 'abc',
		kind: 'bar',
		money: true,
		wide: true,
		labels: data.report.rows
			.filter((r) => r.rank !== null)
			.slice(0, 20)
			.map((r) => r.item),
		series: [
			{
				label: used ? m.reports_abc_series_used() : m.reports_abc_series_sales(),
				data: data.report.rows
					.filter((r) => r.rank !== null)
					.slice(0, 20)
					.map((r) => r.value)
			}
		]
	});
</script>

<svelte:head>
	<title>{m.nav_abc()}</title>
</svelte:head>

<div class="flex flex-col gap-6">
	<div>
		<h1 class="text-2xl font-semibold">{m.nav_abc()}</h1>
		<p class="text-muted-foreground">
			{used ? m.reports_abc_intro_used() : m.reports_abc_intro_sales()}
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
		{#if data.sells}
			<div class="flex flex-col gap-1">
				<Label for="basis">{m.reports_abc_rank_by()}</Label>
				<select id="basis" name="basis" class={select} value={data.basis}>
					<option value="cost">{m.reports_abc_rank_cost()}</option>
					<option value="revenue">{m.reports_abc_rank_revenue()}</option>
				</select>
			</div>
		{/if}
	</ReportFilterBar>

	<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
		{#each tiles as stat (stat.key)}<StatCard {stat} />{/each}
	</div>

	{#if data.report.total > 0}
		<ReportChart {chart} />
	{/if}

	<DataTable
		data={data.report.rows}
		columns={cols}
		fileName={m.reports_file_abc({ from: data.from, to: data.to })}
		facetKeys={['class', 'category']}
		facetLabels={{ class: m.reports_col_class(), category: m.reports_category() }}
	/>
</div>
