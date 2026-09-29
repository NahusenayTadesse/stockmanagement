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
		title={m.admin_users_heading({ count: data.userList.length })}
		tabTitle={m.admin_users_title()}
	>
		{#snippet actions()}
			<Button href="/dashboard/admin-panel/users/add-users"><Plus /> {m.admin_users_add()}</Button>
		{/snippet}
	</PageHeader>

	<DataTable data={data.userList} {columns} fileName={m.admin_users_title()} />
</div>
