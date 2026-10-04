<script lang="ts">
	import StatCard from '$lib/components/StatCard.svelte';
	import DataTable from '@nahu/admin-kit/components/Table/data-table.svelte';
	import { Button } from '@nahu/admin-kit/components/ui/button/index.js';
	import { m } from '$lib/paraglide/messages.js';
	import { formatETB } from '@nahu/admin-kit/global';
	let sale = $state(false);
	const rows = [{ name: 'A4 paper / A4 ወረቀት', sku: 'PAP-A4', quantity: 24 }, { name: 'Blue pen / ሰማያዊ እስክርቢቶ', sku: 'PEN-BL', quantity: 8 }];
	const columns = $derived([{ accessorKey: 'name', header: m.common_item() }, { accessorKey: 'sku', header: 'SKU' }, { accessorKey: 'quantity', header: m.stock_on_hand(), meta: { align: 'right' as const } }]);
</script>
<div class="min-w-0 rounded-xl border bg-card p-4 shadow-lg sm:p-6" data-testid="product-preview">
	<p class="mb-4 text-xs font-medium text-muted-foreground">{m.site_demo_note()}</p>
	<div class="mb-4 flex flex-wrap gap-2"><Button size="sm" variant={sale ? 'outline' : 'default'} onclick={() => sale = false}>{m.site_demo_stock()}</Button><Button size="sm" variant={sale ? 'default' : 'outline'} onclick={() => sale = true}>{m.site_demo_sell()}</Button></div>
	{#if sale}
		<div class="rounded-lg border p-4"><h3>{m.sales_pos_receipt()}</h3><p class="mt-4">2 × A4 paper · {formatETB(500)}</p><dl class="mt-4 grid grid-cols-2 gap-2"><dt>{m.common_total()}</dt><dd class="text-right font-semibold">{formatETB(1000)}</dd><dt>{m.sales_paid()}</dt><dd class="text-right">{formatETB(1000)}</dd><dt>{m.sales_change()}</dt><dd class="text-right">{formatETB(0)}</dd></dl></div>
	{:else}
		<div class="mb-4 grid grid-cols-2 gap-3"><StatCard stat={{ key: 'value', group: 'stock', label: m.admin_home_stock_value(), value: 12400, format: 'money' }} /><StatCard stat={{ key: 'low', group: 'stock', label: m.admin_home_low(), value: 1, format: 'count', tone: 'warning' }} /></div>
		<DataTable variant="compact" data={rows} {columns} />
	{/if}
</div>
