<script lang="ts">
	import { m } from '$lib/paraglide/messages.js';
	import DataTable from '@nahu/admin-kit/components/Table/data-table.svelte';
	import { formatETB } from '@nahu/admin-kit/global';
	import { columns } from './columns';

	let { data } = $props();

	const total = $derived(data.rows.reduce((sum, r) => sum + Number(r.value), 0));
</script>

<svelte:head>
	<title>{m.stock_onhand_title()}</title>
</svelte:head>

<div class="flex flex-col gap-4">
	<div class="flex flex-wrap items-end justify-between gap-2">
		<div>
			<h1 class="text-2xl font-semibold">{m.stock_onhand_title()}</h1>
			<p class="text-muted-foreground">
				{m.stock_onhand_intro()}
			</p>
		</div>
		<p class="text-lg font-semibold">{formatETB(total)}</p>
	</div>

	<DataTable
		data={data.rows}
		{columns}
		fileName={m.stock_onhand_title()}
		facetKeys={['branch', 'location', 'category']}
		charts
	/>
</div>
