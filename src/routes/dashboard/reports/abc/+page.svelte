<script lang="ts">
	import PageHeader from '@nahu/admin-kit/components/PageHeader.svelte';
	import ReportChart from '@nahu/admin-kit/components/reports/ReportChart.svelte';
	import type { ReportChartData, Stat } from '@nahu/admin-kit/components/reports/types';
	import FilterSelect from '$lib/components/filters/FilterSelect.svelte';
	import ReportFilterBar from '../ReportFilterBar.svelte';
	import ReportTable from '../ReportTable.svelte';
	import StatGrid from '../StatGrid.svelte';
	import { labels } from '$lib/format';
	import { CLASS_NAMES, columns } from './columns';
	import { m } from '$lib/paraglide/messages.js';

	let { data } = $props();

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

<div class="flex flex-col gap-6">
	<PageHeader
		title={m.nav_abc()}
		description={used ? m.reports_abc_intro_used() : m.reports_abc_intro_sales()}
	/>

	<ReportFilterBar
		branches={data.branches}
		locations={data.locations}
		branchId={data.branchId}
		locationId={data.locationId}
		from={data.from}
		to={data.to}
	>
		{#if data.sells}
			<FilterSelect
				name="basis"
				label={m.reports_abc_rank_by()}
				value={data.basis}
				options={[
					{ value: 'cost', name: m.reports_abc_rank_cost() },
					{ value: 'revenue', name: m.reports_abc_rank_revenue() }
				]}
				anyLabel={null}
			/>
		{/if}
	</ReportFilterBar>

	<StatGrid stats={tiles} />

	{#if data.report.total > 0}
		<ReportChart {chart} />
	{/if}

	<ReportTable
		data={data.report.rows}
		columns={cols}
		variant="list"
		fileName={m.reports_file_abc({ from: data.from, to: data.to })}
		facetKeys={['class', 'category']}
		facetLabels={{ class: m.reports_col_class(), category: m.reports_category() }}
	/>
</div>
