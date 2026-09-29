<script lang="ts">
	import { m } from '$lib/paraglide/messages.js';
	import DataTable from '@nahu/admin-kit/components/Table/data-table.svelte';
	import PageHeader from '@nahu/admin-kit/components/PageHeader.svelte';
	import PageSection from '@nahu/admin-kit/components/PageSection.svelte';
	import { roadColumns, shortColumns } from './columns';

	let { data } = $props();
</script>

<div class="flex flex-col gap-6">
	<PageHeader title={m.stock_transfers_title()} description={m.stock_transfers_intro()} />

	<PageSection title={m.stock_on_the_road_count({ count: data.onTheRoad.length })}>
		<DataTable
			variant="compact"
			search
			data={data.onTheRoad}
			columns={roadColumns}
			fileName={m.stock_transfers_title()}
		/>
	</PageSection>

	<PageSection
		title={m.stock_arrived_short()}
		hint={m.stock_arrived_short_hint({ days: data.lossDays })}
	>
		<DataTable
			variant="compact"
			search
			data={data.short}
			columns={shortColumns}
			fileName={m.stock_arrived_short_file()}
		/>
	</PageSection>
</div>
