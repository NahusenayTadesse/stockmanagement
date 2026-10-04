<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { useKit } from '@nahu/admin-kit/context';
	import { Button } from '@nahu/admin-kit/components/ui/button/index.js';
	import PageHeader from '@nahu/admin-kit/components/PageHeader.svelte';
	import DataTable from '@nahu/admin-kit/components/Table/data-table.svelte';
	import { linkColumn, quantityColumn } from '$lib/table';
	import { m } from '$lib/paraglide/messages.js';
	let { data } = $props();
	const kit = useKit();
	type Row = typeof data.rows[number];
	const columns = [linkColumn<Row>('name', m.common_item, 'item', r => ({ id: r.id, name: r.name })), quantityColumn<Row>('onHand', m.stock_on_hand), quantityColumn<Row>('reorderLevel', m.stock_reorder_at)];
	const href = (n: number) => { const params = new URLSearchParams(page.url.search); params.set('page', String(n)); return `?${params}`; };
</script>
<PageHeader title={m.admin_home_low()} description={m.admin_home_stock_scope()} />
<div class="my-4 flex flex-wrap items-center justify-between gap-3">
	<p>{m.admin_home_preview_count({ shown: data.rows.length, total: data.total })}</p>
	{#if kit.canOpen('/dashboard/purchasing/reorder')}<Button href="{resolve('/dashboard/purchasing/reorder')}?branch={page.url.searchParams.get('branch') ?? 0}">{m.admin_home_reorder()}</Button>{/if}
</div>
<DataTable data={data.rows} {columns} />
<nav class="my-4 flex gap-3" aria-label={m.common_next_page()}>
	{#if data.page > 1}<Button variant="outline" href={href(data.page - 1)}>{m.common_previous_page()}</Button>{/if}
	{#if data.page * 50 < data.total}<Button variant="outline" href={href(data.page + 1)}>{m.common_next_page()}</Button>{/if}
</nav>
