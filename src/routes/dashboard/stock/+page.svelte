<script lang="ts">
	import DataTable from '@nahu/admin-kit/components/Table/data-table.svelte';
	import { formatETB } from '@nahu/admin-kit/global';
	import { columns } from './columns';

	let { data } = $props();

	const total = $derived(data.rows.reduce((sum, r) => sum + Number(r.value), 0));
</script>

<svelte:head>
	<title>Stock on hand</title>
</svelte:head>

<div class="flex flex-col gap-4">
	<div class="flex flex-wrap items-end justify-between gap-2">
		<div>
			<h1 class="text-2xl font-semibold">Stock on hand</h1>
			<p class="text-muted-foreground">By location and lot, valued at average cost.</p>
		</div>
		<p class="text-lg font-semibold">{formatETB(total)}</p>
	</div>

	<DataTable
		data={data.rows}
		{columns}
		fileName="Stock on hand"
		facetKeys={['branch', 'location', 'category']}
		charts
	/>
</div>
