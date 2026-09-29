<script lang="ts">
	import { m } from '$lib/paraglide/messages.js';
	import Plus from '@lucide/svelte/icons/plus';
	import DataTable from '@nahu/admin-kit/components/Table/data-table.svelte';
	import { Button } from '@nahu/admin-kit/components/ui/button/index.js';
	import { columns } from './columns';

	let { data } = $props();
</script>

<svelte:head>
	<title>{m.admin_users_title()}</title>
</svelte:head>

<div class="mb-4 flex items-center justify-between gap-2">
	<h1 class="text-2xl font-semibold">{m.admin_users_heading({ count: data.userList.length })}</h1>
	<Button href="/dashboard/admin-panel/users/add-users"><Plus /> {m.admin_users_add()}</Button>
</div>

<DataTable data={data.userList} {columns} fileName={m.admin_users_title()} />
