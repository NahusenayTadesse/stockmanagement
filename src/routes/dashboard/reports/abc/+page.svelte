<script lang="ts">
	import DataTable from '@nahu/admin-kit/components/Table/data-table.svelte';
	import ReportChart from '@nahu/admin-kit/components/reports/ReportChart.svelte';
	import StatCard from '@nahu/admin-kit/components/reports/StatCard.svelte';
	import type { ReportChartData, Stat } from '@nahu/admin-kit/components/reports/types';
	import { Label } from '@nahu/admin-kit/components/ui/label/index.js';
	import ReportFilterBar from '../ReportFilterBar.svelte';
	import { CLASS_NAMES, columns } from './columns';

	let { data } = $props();

	const select = 'h-9 rounded-md border bg-background px-2 text-sm';
	const used = $derived(data.basis === 'cost');
	const cols = $derived(columns(data.basis));
	const HINTS: Record<string, string> = {
		A: 'The few items carrying 80% of the value: count often, never run out',
		B: 'The next 15%',
		C: 'The last 5%: many items, little value',
		none: 'In stock but not used in the period'
	};

	const tiles = $derived<Stat[]>(
		data.report.classes.map((c) => ({
			key: c.cls,
			label: `${CLASS_NAMES[c.cls]} · ${c.items} item${c.items === 1 ? '' : 's'}`,
			value: c.cls === 'none' ? c.stockValue : c.value,
			format: 'money',
			group: 'abc',
			tone:
				c.cls === 'A' ? 'positive' : c.cls === 'none' && c.stockValue > 0 ? 'warning' : 'neutral',
			hint: c.cls === 'none' ? `${HINTS.none} · stock value` : `${c.share}% · ${HINTS[c.cls]}`
		}))
	);

	const chart = $derived<ReportChartData>({
		key: 'pareto',
		title: used ? 'Value used, by item' : 'Sales, by item',
		description: 'The top 20 items, with the running share of the total',
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
				label: used ? 'Value used' : 'Sales',
				data: data.report.rows
					.filter((r) => r.rank !== null)
					.slice(0, 20)
					.map((r) => r.value)
			}
		]
	});
</script>

<svelte:head>
	<title>ABC analysis</title>
</svelte:head>

<div class="flex flex-col gap-6">
	<div>
		<h1 class="text-2xl font-semibold">ABC analysis</h1>
		<p class="text-muted-foreground">
			Items ranked by {used
				? 'what was used, at cost (issues less customer returns)'
				: 'what they sold for, before VAT (less returns)'}, and cut where the running total reaches
			80% (A) and 95% (B). Look after the A items most: count them often and never let them run out.
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
				<Label for="basis">Rank by</Label>
				<select id="basis" name="basis" class={select} value={data.basis}>
					<option value="cost">Value used (at cost)</option>
					<option value="revenue">Sales revenue</option>
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
		fileName="ABC analysis {data.from} to {data.to}"
		facetKeys={['class', 'category']}
		facetLabels={{ class: 'Class', category: 'Category' }}
	/>
</div>
