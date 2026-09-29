<script lang="ts">
	import { m } from '$lib/paraglide/messages.js';
	import DataTable from '@nahu/admin-kit/components/Table/data-table.svelte';
	import PageHeader from '@nahu/admin-kit/components/PageHeader.svelte';
	import { formatETB } from '@nahu/admin-kit/global';
	import { columns } from './columns';

	let { data } = $props();

	const total = $derived(data.rows.reduce((sum, r) => sum + Number(r.value), 0));
</script>

<div class="flex flex-col gap-4">
	<PageHeader title={m.stock_onhand_title()} description={m.stock_onhand_intro()}>
		{#snippet actions()}
			<p class="text-lg font-semibold">{formatETB(total)}</p>
		{/snippet}
	</PageHeader>

	<DataTable
		data={data.rows}
		{columns}
		fileName={m.stock_onhand_title()}
		facetKeys={['branch', 'location', 'category']}
		charts
	/>
</div>
