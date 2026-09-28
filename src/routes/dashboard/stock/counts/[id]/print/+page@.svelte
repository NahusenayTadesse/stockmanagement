<script lang="ts">
	import PrintSheet from '@nahu/admin-kit/components/PrintSheet.svelte';
	import { fileUrl } from '@nahu/admin-kit/files';
	import { formatEthiopianDate } from '@nahu/admin-kit/global';
	import { qty } from '$lib/format';

	let { data } = $props();
</script>

<svelte:head>
	<title>Count sheet #{data.count.id}</title>
</svelte:head>

<PrintSheet
	branch={{ name: data.org.name, address: null, phone: null }}
	fallbackName={data.org.name}
>
	<section class="flex items-start justify-between gap-6">
		<div class="flex flex-col gap-1">
			<h1 class="text-xl font-bold">Stock count sheet — Count #{data.count.id}</h1>
			<p>
				{data.location}{data.category ? ` · ${data.category}` : ''} ·
				{formatEthiopianDate(new Date(`${data.count.countDate}T12:00:00+03:00`))} ({data.count
					.countDate})
			</p>
			{#if data.count.blind}<p class="text-sm">
					Blind count: write what you find, not what you expect.
				</p>{/if}
		</div>
		{#if data.org.logo}<img
				src={fileUrl(data.org.logo)}
				alt=""
				class="h-16 max-w-40 object-contain"
			/>{/if}
	</section>

	<table class="w-full border-collapse text-sm">
		<thead>
			<tr class="border-b-2 text-left">
				<th class="py-1 pr-2">#</th>
				<th class="py-1 pr-2">Item</th>
				<th class="py-1 pr-2">Lot / expiry</th>
				{#if data.showExpected}<th class="py-1 pr-2 text-right">Expected</th>{/if}
				<th class="w-32 py-1 text-right">Counted</th>
			</tr>
		</thead>
		<tbody>
			{#each data.lines as line, i (line.id)}
				<tr class="border-b">
					<td class="py-2 pr-2">{i + 1}</td>
					<td class="py-2 pr-2"
						>{line.item}<br /><span class="text-xs">{line.sku} · {line.unit}</span></td
					>
					<td class="py-2 pr-2 text-xs"
						>{line.lotNumber ?? ''}{line.expiryDate ? ` · ${line.expiryDate}` : ''}</td
					>
					{#if data.showExpected}<td class="py-2 pr-2 text-right">{qty(line.expected)}</td>{/if}
					<td class="py-2 text-right">______________</td>
				</tr>
			{/each}
		</tbody>
	</table>

	<p class="text-sm">
		Items found that are not on this sheet: write them below with their lot and quantity.
	</p>
	<div class="h-24 border-b"></div>

	<div class="mt-10 grid grid-cols-3 gap-6 text-sm">
		<div class="border-t pt-1">Counted by</div>
		<div class="border-t pt-1">Checked by</div>
		<div class="border-t pt-1">Date and time</div>
	</div>
</PrintSheet>
