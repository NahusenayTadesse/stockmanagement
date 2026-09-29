<script lang="ts">
	import DataTable from '@nahu/admin-kit/components/Table/data-table.svelte';
	import StatCard from '@nahu/admin-kit/components/reports/StatCard.svelte';
	import type { Stat } from '@nahu/admin-kit/components/reports/types';
	import { Label } from '@nahu/admin-kit/components/ui/label/index.js';
	import ReportFilterBar from '../ReportFilterBar.svelte';
	import { periodColumns, summaryColumns } from './columns';
	import { m } from '$lib/paraglide/messages.js';

	let { data } = $props();

	const select = 'h-9 rounded-md border bg-background px-2 text-sm';
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

<svelte:head>
	<title>{m.nav_stock_outs()}</title>
</svelte:head>

<div class="flex flex-col gap-6">
	<div>
		<h1 class="text-2xl font-semibold">{m.reports_outs_title()}</h1>
		<p class="text-muted-foreground">{m.reports_outs_intro()}</p>
	</div>

	<ReportFilterBar
		branches={data.branches}
		locations={data.locations}
		branchId={data.branchId}
		locationId={data.locationId}
		from={data.from}
		to={data.to}
		allLocationsLabel={m.reports_all_shelves()}
	>
		<div class="flex flex-col gap-1">
			<Label for="by">{m.reports_outs_count()}</Label>
			<select id="by" name="by" class={select} value={data.byLocation ? 'location' : 'item'}>
				<option value="item">{m.reports_outs_across()}</option>
				<option value="location">{m.reports_outs_each()}</option>
			</select>
		</div>
	</ReportFilterBar>

	<div class="grid gap-4 sm:grid-cols-3">
		{#each tiles as stat (stat.key)}<StatCard {stat} />{/each}
	</div>

	<h2 class="text-lg font-semibold">{m.reports_outs_by_item()}</h2>
	<DataTable
		data={items}
		columns={summaryColumns}
		fileName={m.reports_file_outs_by_item({ from: data.from, to: data.to })}
		facetKeys={['now']}
		facetLabels={{ now: m.reports_col_now() }}
		height="auto"
	/>

	<h2 class="text-lg font-semibold">{m.reports_outs_every()}</h2>
	<DataTable
		data={data.report.periods}
		columns={periodColumns}
		fileName={m.reports_file_outs({ from: data.from, to: data.to })}
		height="auto"
	/>
</div>
