<script lang="ts">
	import { m } from '$lib/paraglide/messages.js';
	import Plus from '@lucide/svelte/icons/plus';
	import DataTable from '@nahu/admin-kit/components/Table/data-table.svelte';
	import { Button } from '@nahu/admin-kit/components/ui/button/index.js';
	import { columns } from './columns';

	let { data } = $props();
</script>

<svelte:head>
	<title>{m.admin_roles_title()}</title>
</svelte:head>

<div class="mb-4 flex items-center justify-between gap-2">
	<h1 class="text-2xl font-semibold">{m.admin_roles_heading({ count: data.roleList.length })}</h1>
	<Button href="/dashboard/admin-panel/roles/add-roles"><Plus /> {m.admin_roles_add()}</Button>
</div>

<DataTable data={data.roleList} {columns} fileName={m.admin_roles_title()} />
