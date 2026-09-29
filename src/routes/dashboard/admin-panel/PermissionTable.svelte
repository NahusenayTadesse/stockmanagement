<script lang="ts">
	import PageSection from '@nahu/admin-kit/components/PageSection.svelte';
	import type { ColumnDef } from '@tanstack/table-core';
	import { m } from '$lib/paraglide/messages.js';
	import DataTable from '@nahu/admin-kit/components/Table/data-table.svelte';
	import { renderSnippet } from '@nahu/admin-kit/components/ui/data-table/index.js';

	/** What a role or a person may do: each permission in words, with its code under it. */
	type Permission = { key: string | number; words: string; code: string };

	let {
		title,
		permissions,
		empty
	}: {
		title: string;
		permissions: Permission[];
		/** Said instead of an empty table. */
		empty: string;
	} = $props();

	const columns: ColumnDef<Permission>[] = [
		{
			id: 'permission',
			accessorFn: (p) => `${p.words} ${p.code}`,
			header: () => m.admin_users_permissions(),
			cell: ({ row }) => renderSnippet(permissionCell, row.original)
		}
	];
</script>

{#snippet permissionCell(p: Permission)}
	<p>{p.words}</p>
	<p class="font-mono text-xs text-muted-foreground">{p.code}</p>
{/snippet}

<PageSection {title}>
	{#if permissions.length}
		<DataTable variant="compact" paginate={false} data={permissions} {columns} />
	{:else}
		<p class="rounded-md border px-4 py-2 text-muted-foreground">{empty}</p>
	{/if}
</PageSection>
