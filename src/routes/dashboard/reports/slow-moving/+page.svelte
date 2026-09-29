<script lang="ts">
	import PageHeader from '@nahu/admin-kit/components/PageHeader.svelte';
	import type { Stat } from '@nahu/admin-kit/components/reports/types';
	import { Input } from '@nahu/admin-kit/components/ui/input/index.js';
	import FilterField from '$lib/components/filters/FilterField.svelte';
	import FilterSelect from '$lib/components/filters/FilterSelect.svelte';
	import ReportFilterBar from '../ReportFilterBar.svelte';
	import ReportTable from '../ReportTable.svelte';
	import StatGrid from '../StatGrid.svelte';
	import { columns } from './columns';
	import { m } from '$lib/paraglide/messages.js';

	let { data } = $props();

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

<div class="flex flex-col gap-6">
	<PageHeader title={m.reports_slow_title()} description={m.reports_slow_intro()} />

	<ReportFilterBar
		branches={data.branches}
		locations={data.locations}
		branchId={data.branchId}
		locationId={data.locationId}
	>
		<FilterSelect
			name="category"
			label={m.reports_category()}
			value={data.categoryId}
			options={data.categories}
			anyLabel={m.reports_all_categories()}
			anyValue={0}
		/>
		<FilterField label={m.reports_slow_after()} for="slow">
			<Input id="slow" name="slow" type="number" min="1" value={data.slowDays} class="w-28" />
		</FilterField>
		<FilterField label={m.reports_dead_after()} for="dead">
			<Input id="dead" name="dead" type="number" min="1" value={data.deadDays} class="w-28" />
		</FilterField>
	</ReportFilterBar>

	<StatGrid stats={tiles} columns={2} />

	<ReportTable
		data={rows}
		{columns}
		variant="list"
		fileName={m.reports_file_slow({ date: data.today })}
		facetKeys={['statusName', 'category']}
		facetLabels={{ statusName: m.common_status(), category: m.reports_category() }}
	/>
</div>
