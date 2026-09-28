<script lang="ts">
	import PrintSheet from '@nahu/admin-kit/components/PrintSheet.svelte';
	import { formatETB, formatEthiopianDate } from '@nahu/admin-kit/global';
	import { fileUrl } from '@nahu/admin-kit/files';
	import { qty } from '$lib/format';

	let { data } = $props();

	const order = $derived(data.order);
	const total = $derived(data.lines.reduce((s, l) => s + l.value, 0));
	const day = (d: string) => `${formatEthiopianDate(new Date(`${d}T12:00:00+03:00`))} (${d})`;
</script>

<svelte:head>
	<title>{order.number ?? 'Draft'} · Purchase Order</title>
</svelte:head>

<PrintSheet
	branch={{
		name: data.org.name,
		address: data.details.branchAddress,
		phone: data.details.branchPhone
	}}
	fallbackName={data.org.name}
>
	<section class="flex items-start justify-between gap-6">
		<div class="flex flex-col gap-1">
			<h1 class="text-xl font-bold">Purchase Order</h1>
			<p>No. <strong>{order.number ?? `DRAFT ${order.id} — not placed`}</strong></p>
			{#if data.org.tin}<p class="text-sm">TIN {data.org.tin}</p>{/if}
		</div>
		{#if data.org.logo}
			<img
				src={fileUrl(data.org.logo)}
				alt="{data.org.name} logo"
				class="h-20 max-w-48 object-contain"
			/>
		{/if}
	</section>

	<dl class="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
		<dt class="font-semibold">To</dt>
		<dd>
			{data.details.supplier}, {data.details.supplierPhone}{data.supplier.tin
				? `, TIN ${data.supplier.tin}`
				: ''}{data.supplier.address ? `, ${data.supplier.address}` : ''}
		</dd>
		<dt class="font-semibold">Order date</dt>
		<dd>{day(order.orderDate)}</dd>
		{#if order.expectedDate}
			<dt class="font-semibold">Deliver by</dt>
			<dd>{day(order.expectedDate)}</dd>
		{/if}
		<dt class="font-semibold">Deliver to</dt>
		<dd>{data.details.location}, {data.details.branch}</dd>
		{#if order.reference}
			<dt class="font-semibold">Your reference</dt>
			<dd>{order.reference}</dd>
		{/if}
	</dl>

	<table class="w-full border-collapse text-sm">
		<thead>
			<tr class="border-b-2 text-left">
				<th class="py-1 pr-2">#</th>
				<th class="py-1 pr-2">Item</th>
				<th class="py-1 pr-2 text-right">Quantity</th>
				<th class="py-1 pr-2 text-right">Unit price</th>
				<th class="py-1 text-right">Amount</th>
			</tr>
		</thead>
		<tbody>
			{#each data.lines as line, i (line.id)}
				<tr class="border-b align-top">
					<td class="py-1 pr-2">{i + 1}</td>
					<td class="py-1 pr-2">
						{line.item}<br /><span class="text-xs"
							>{line.sku}{line.note ? ` · ${line.note}` : ''}</span
						>
					</td>
					<td class="py-1 pr-2 text-right">{qty(line.quantity, line.unit)}</td>
					<td class="py-1 pr-2 text-right"
						>{line.unitPrice == null ? '' : formatETB(line.unitPrice)}</td
					>
					<td class="py-1 text-right">{line.unitPrice == null ? '' : formatETB(line.value)}</td>
				</tr>
			{/each}
		</tbody>
		<tfoot>
			<tr class="font-semibold">
				<td colspan="4" class="py-1 pr-2 text-right">Total</td>
				<td class="py-1 text-right">{formatETB(total)}</td>
			</tr>
		</tfoot>
	</table>

	{#if order.note}<p class="text-sm whitespace-pre-line">Note: {order.note}</p>{/if}
	<p class="text-sm">Please quote this order number on your delivery note and invoice.</p>

	<div class="mt-12 grid grid-cols-2 gap-6 text-sm">
		<div class="border-t pt-1">Ordered by</div>
		<div class="border-t pt-1">Approved by</div>
	</div>
</PrintSheet>
