<script lang="ts">
	import PageHeader from '@nahu/admin-kit/components/PageHeader.svelte';
	import type { Stat } from '@nahu/admin-kit/components/reports/types';
	import FilterSelect from '$lib/components/filters/FilterSelect.svelte';
	import ReportFilterBar from '../ReportFilterBar.svelte';
	import ReportTable from '../ReportTable.svelte';
	import StatGrid from '../StatGrid.svelte';
	import { periodColumns, summaryColumns } from './columns';
	import { m } from '$lib/paraglide/messages.js';

	let { data } = $props();

	const items = $derived(data.report.items);
	const tiles = $derived<Stat[]>([
		{
			key: 'now',
			label: m.reports_outs_now(),
			value: items.filter((i) => i.stillOut).length,
			format: 'count',
			group: 'outs',
			tone: items.some((i) => i.stillOut) ? 'negative' : 'neutral',
			hint: m.reports_outs_now_hint()
		},
		{
			key: 'items',
			label: m.reports_outs_period(),
			value: items.length,
			format: 'count',
			group: 'outs',
			hint: (data.report.periods.length === 1
				? m.reports_outs_times_one
				: m.reports_outs_times_many)({
				count: data.report.periods.length
			})
		},
		{
			key: 'days',
			label: m.reports_outs_days(),
			value: items.reduce((s, i) => s + i.days, 0),
			format: 'days',
			group: 'outs',
			tone: 'warning',
			hint: m.reports_outs_days_hint()
		}
	]);
</script>

<div class="flex flex-col gap-6">
	<PageHeader
		title={m.reports_outs_title()}
		tabTitle={m.nav_stock_outs()}
		description={m.reports_outs_intro()}
	/>

	<ReportFilterBar
		branches={data.branches}
		locations={data.locations}
		branchId={data.branchId}
		locationId={data.locationId}
		from={data.from}
		to={data.to}
		allLocationsLabel={m.reports_all_shelves()}
	>
		<FilterSelect
			name="by"
			label={m.reports_outs_count()}
			value={data.byLocation ? 'location' : 'item'}
			options={[
				{ value: 'item', name: m.reports_outs_across() },
				{ value: 'location', name: m.reports_outs_each() }
			]}
			anyLabel={null}
		/>
	</ReportFilterBar>

	<StatGrid stats={tiles} columns={3} />

	<ReportTable
		title={m.reports_outs_by_item()}
		data={items}
		columns={summaryColumns}
		fileName={m.reports_file_outs_by_item({ from: data.from, to: data.to })}
		facetKeys={['now']}
		facetLabels={{ now: m.reports_col_now() }}
	/>

	<ReportTable
		title={m.reports_outs_every()}
		data={data.report.periods}
		columns={periodColumns}
		fileName={m.reports_file_outs({ from: data.from, to: data.to })}
	/>
</div>
