<script lang="ts">
	import { m } from '$lib/paraglide/messages.js';
	import Plus from '@lucide/svelte/icons/plus';
	import DataTable from '@nahu/admin-kit/components/Table/data-table.svelte';
	import { Button } from '@nahu/admin-kit/components/ui/button/index.js';
	import PageHeader from '@nahu/admin-kit/components/PageHeader.svelte';
	import { columns } from './columns';

	let { data } = $props();
</script>

<div class="flex flex-col gap-4">
	<PageHeader
		title={m.admin_roles_heading({ count: data.roleList.length })}
		tabTitle={m.admin_roles_title()}
	>
		{#snippet actions()}
			<Button href="/dashboard/admin-panel/roles/add-roles"><Plus /> {m.admin_roles_add()}</Button>
		{/snippet}
	</PageHeader>

	<DataTable data={data.roleList} {columns} fileName={m.admin_roles_title()} />
</div>
