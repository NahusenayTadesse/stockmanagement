<script lang="ts">
	import DataTable from '@nahu/admin-kit/components/Table/data-table.svelte';
	import PageHeader from '@nahu/admin-kit/components/PageHeader.svelte';
	import { m } from '$lib/paraglide/messages.js';
	import { columns } from './columns';

	let { data } = $props();
</script>

<div class="flex flex-col gap-4">
	<PageHeader
		title={m.sales_shifts_title()}
		description={data.all ? m.sales_shifts_intro_all() : m.sales_shifts_intro_mine()}
	/>
	<DataTable
		data={data.shifts}
		{columns}
		variant="list"
		fileName={m.sales_shifts_title()}
		facetKeys={['cashier', 'status']}
	/>
</div>
