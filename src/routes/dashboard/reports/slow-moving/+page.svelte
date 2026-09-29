<script lang="ts">
	import DataTable from '@nahu/admin-kit/components/Table/data-table.svelte';
	import StatCard from '@nahu/admin-kit/components/reports/StatCard.svelte';
	import type { Stat } from '@nahu/admin-kit/components/reports/types';
	import { Input } from '@nahu/admin-kit/components/ui/input/index.js';
	import { Label } from '@nahu/admin-kit/components/ui/label/index.js';
	import ReportFilterBar from '../ReportFilterBar.svelte';
	import { columns } from './columns';
	import { m } from '$lib/paraglide/messages.js';

	let { data } = $props();

	const select = 'h-9 rounded-md border bg-background px-2 text-sm';
	const rows = $derived(data.report.rows);
	const tiles = $derived<Stat[]>([
		{
			key: 'dead',
			label: m.reports_dead_stock(),
			value: data.report.deadValue,
			format: 'money',
			group: 'slow',
			tone: data.report.deadValue > 0 ? 'negative' : 'neutral',
			hint: m.reports_dead_hint({
				days: data.deadDays,
				count: rows.filter((r) => r.status === 'dead').length
			})
		},
		{
			key: 'slow',
			label: m.reports_slow_stock(),
			value: data.report.slowValue,
			format: 'money',
			group: 'slow',
			tone: data.report.slowValue > 0 ? 'warning' : 'neutral',
			hint: m.reports_slow_hint({
				from: data.slowDays,
				to: data.deadDays - 1,
				count: rows.filter((r) => r.status === 'slow').length
			})
		}
	]);
</script>

<svelte:head>
	<title>{m.reports_slow_title()}</title>
</svelte:head>

<div class="flex flex-col gap-6">
	<div>
		<h1 class="text-2xl font-semibold">{m.reports_slow_title()}</h1>
		<p class="text-muted-foreground">{m.reports_slow_intro()}</p>
	</div>

	<ReportFilterBar
		branches={data.branches}
		locations={data.locations}
		branchId={data.branchId}
		locationId={data.locationId}
	>
		<div class="flex flex-col gap-1">
			<Label for="category">{m.reports_category()}</Label>
			<select id="category" name="category" class={select} value={data.categoryId}>
				<option value={0}>{m.reports_all_categories()}</option>
				{#each data.categories as c (c.value)}
					<option value={c.value}>{c.name}</option>
				{/each}
			</select>
		</div>
		<div class="flex w-28 flex-col gap-1">
			<Label for="slow">{m.reports_slow_after()}</Label>
			<Input id="slow" name="slow" type="number" min="1" value={data.slowDays} />
		</div>
		<div class="flex w-28 flex-col gap-1">
			<Label for="dead">{m.reports_dead_after()}</Label>
			<Input id="dead" name="dead" type="number" min="1" value={data.deadDays} />
		</div>
	</ReportFilterBar>

	<div class="grid gap-4 sm:grid-cols-2">
		{#each tiles as stat (stat.key)}<StatCard {stat} />{/each}
	</div>

	<DataTable
		data={rows}
		{columns}
		fileName={m.reports_file_slow({ date: data.today })}
		facetKeys={['statusName', 'category']}
		facetLabels={{ statusName: m.common_status(), category: m.reports_category() }}
	/>
</div>
