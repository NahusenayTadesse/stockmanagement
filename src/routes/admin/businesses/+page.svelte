<script lang="ts">
	import PageHeader from '@nahu/admin-kit/components/PageHeader.svelte';
	import DataTable from '@nahu/admin-kit/components/Table/data-table.svelte';
	import { businessColumns } from '../businessColumns';
	import { m } from '$lib/paraglide/messages.js';

	let { data } = $props();

	const columns = businessColumns();
</script>

<div class="flex flex-col gap-6">
	<PageHeader title={m.platform_nav_businesses()} description={m.platform_businesses_intro()} />
	<DataTable
		data={data.businesses}
		{columns}
		variant="list"
		fileName={m.platform_nav_businesses()}
	/>
</div>
