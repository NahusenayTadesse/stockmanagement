<script lang="ts">
	import DataTable from '@nahu/admin-kit/components/Table/data-table.svelte';
	import StatCard from '@nahu/admin-kit/components/reports/StatCard.svelte';
	import type { Stat } from '@nahu/admin-kit/components/reports/types';
	import { Input } from '@nahu/admin-kit/components/ui/input/index.js';
	import { Label } from '@nahu/admin-kit/components/ui/label/index.js';
	import ReportFilterBar from '../ReportFilterBar.svelte';
	import { columns } from './columns';

	let { data } = $props();

	const select = 'h-9 rounded-md border bg-background px-2 text-sm';
	const rows = $derived(data.report.rows);
	const tiles = $derived<Stat[]>([
		{
			key: 'dead',
			label: 'Dead stock',
			value: data.report.deadValue,
			format: 'money',
			group: 'slow',
			tone: data.report.deadValue > 0 ? 'negative' : 'neutral',
			hint: `Idle ${data.deadDays}+ days · ${rows.filter((r) => r.status === 'dead').length} items`
		},
		{
			key: 'slow',
			label: 'Slow-moving stock',
			value: data.report.slowValue,
			format: 'money',
			group: 'slow',
			tone: data.report.slowValue > 0 ? 'warning' : 'neutral',
			hint: `Idle ${data.slowDays}–${data.deadDays - 1} days · ${rows.filter((r) => r.status === 'slow').length} items`
		}
	]);
</script>

<svelte:head>
	<title>Slow-moving and dead stock</title>
</svelte:head>

<div class="flex flex-col gap-6">
	<div>
		<h1 class="text-2xl font-semibold">Slow-moving and dead stock</h1>
		<p class="text-muted-foreground">
			Stock on hand that nobody has sold or used for a while — money sitting on the shelf. "Days
			idle" counts from the last issue, or from when the stock first arrived if it was never issued.
			Discount it, return it to the supplier, or stop reordering it.
		</p>
	</div>

	<ReportFilterBar
		branches={data.branches}
		locations={data.locations}
		branchId={data.branchId}
		locationId={data.locationId}
	>
		<div class="flex flex-col gap-1">
			<Label for="category">Category</Label>
			<select id="category" name="category" class={select} value={data.categoryId}>
				<option value={0}>All categories</option>
				{#each data.categories as c (c.value)}
					<option value={c.value}>{c.name}</option>
				{/each}
			</select>
		</div>
		<div class="flex w-28 flex-col gap-1">
			<Label for="slow">Slow after (days)</Label>
			<Input id="slow" name="slow" type="number" min="1" value={data.slowDays} />
		</div>
		<div class="flex w-28 flex-col gap-1">
			<Label for="dead">Dead after (days)</Label>
			<Input id="dead" name="dead" type="number" min="1" value={data.deadDays} />
		</div>
	</ReportFilterBar>

	<div class="grid gap-4 sm:grid-cols-2">
		{#each tiles as stat (stat.key)}<StatCard {stat} />{/each}
	</div>

	<DataTable
		data={rows}
		{columns}
		fileName="Slow and dead stock {data.today}"
		facetKeys={['statusName', 'category']}
		facetLabels={{ statusName: 'Status', category: 'Category' }}
	/>
</div>
