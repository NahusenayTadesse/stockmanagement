<script lang="ts">
	import DataTable from '@nahu/admin-kit/components/Table/data-table.svelte';
	import StatCard from '@nahu/admin-kit/components/reports/StatCard.svelte';
	import type { Stat } from '@nahu/admin-kit/components/reports/types';
	import { Label } from '@nahu/admin-kit/components/ui/label/index.js';
	import ReportFilterBar from '../ReportFilterBar.svelte';
	import { periodColumns, summaryColumns } from './columns';

	let { data } = $props();

	const select = 'h-9 rounded-md border bg-background px-2 text-sm';
	const items = $derived(data.report.items);
	const tiles = $derived<Stat[]>([
		{
			key: 'now',
			label: 'Out of stock now',
			value: items.filter((i) => i.stillOut).length,
			format: 'count',
			group: 'outs',
			tone: items.some((i) => i.stillOut) ? 'negative' : 'neutral',
			hint: 'Had stock before, have none now'
		},
		{
			key: 'items',
			label: 'Ran out in the period',
			value: items.length,
			format: 'count',
			group: 'outs',
			hint: `${data.report.periods.length} time${data.report.periods.length === 1 ? '' : 's'} in all`
		},
		{
			key: 'days',
			label: 'Days out of stock',
			value: items.reduce((s, i) => s + i.days, 0),
			format: 'days',
			group: 'outs',
			tone: 'warning',
			hint: 'Added up over items'
		}
	]);
</script>

<svelte:head>
	<title>Stock-outs</title>
</svelte:head>

<div class="flex flex-col gap-6">
	<div>
		<h1 class="text-2xl font-semibold">Stock-out history</h1>
		<p class="text-muted-foreground">
			When shelves ran empty, worked out from every movement: each stretch an item had none after
			having had some, and when it came back. Stock in transit or in quarantine is not on a shelf
			and is not counted. Items that run out often need a higher reorder level.
		</p>
	</div>

	<ReportFilterBar
		branches={data.branches}
		locations={data.locations}
		branchId={data.branchId}
		locationId={data.locationId}
		from={data.from}
		to={data.to}
		allLocationsLabel="All shelves together"
	>
		<div class="flex flex-col gap-1">
			<Label for="by">Count</Label>
			<select id="by" name="by" class={select} value={data.byLocation ? 'location' : 'item'}>
				<option value="item">Across the locations chosen</option>
				<option value="location">Each location on its own</option>
			</select>
		</div>
	</ReportFilterBar>

	<div class="grid gap-4 sm:grid-cols-3">
		{#each tiles as stat (stat.key)}<StatCard {stat} />{/each}
	</div>

	<h2 class="text-lg font-semibold">By item</h2>
	<DataTable
		data={items}
		columns={summaryColumns}
		fileName="Stock-outs by item {data.from} to {data.to}"
		facetKeys={['now']}
		facetLabels={{ now: 'Now' }}
		height="auto"
	/>

	<h2 class="text-lg font-semibold">Every stock-out</h2>
	<DataTable
		data={data.report.periods}
		columns={periodColumns}
		fileName="Stock-outs {data.from} to {data.to}"
		height="auto"
	/>
</div>
