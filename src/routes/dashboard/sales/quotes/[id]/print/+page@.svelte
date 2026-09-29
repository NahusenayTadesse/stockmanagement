<script lang="ts">
	import PrintSheet from '@nahu/admin-kit/components/PrintSheet.svelte';
	import { formatETB, formatEthiopianDate } from '@nahu/admin-kit/global';
	import { fileUrl } from '@nahu/admin-kit/files';

	let { data } = $props();
	const q = $derived(data.quote);
	const day = (d: string) => `${formatEthiopianDate(new Date(`${d}T12:00:00+03:00`))} (${d})`;
</script>

<svelte:head>
	<title>Proforma {q.number ?? `draft ${q.id}`}</title>
</svelte:head>

<PrintSheet
	branch={{
		name: data.org.name,
		address: data.branch?.address ?? null,
		phone: data.branch?.phone ?? null
	}}
	fallbackName={data.org.name}
>
	<section class="flex items-start justify-between gap-6">
		<div class="flex flex-col gap-1">
			<h1 class="text-xl font-bold">Proforma Invoice</h1>
			<p>No. <strong>{q.number ?? `DRAFT ${q.id}`}</strong></p>
			<p class="text-sm">{day(q.quoteDate)}</p>
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
			{data.buyer.name ?? '—'}{data.buyer.tin ? `, TIN ${data.buyer.tin}` : ''}{data.buyer.phone
				? `, ${data.buyer.phone}`
				: ''}{data.buyer.address ? `, ${data.buyer.address}` : ''}
		</dd>
		{#if q.reference}<dt class="font-semibold">Your reference</dt>
			<dd>{q.reference}</dd>{/if}
		{#if q.validUntil}<dt class="font-semibold">Valid until</dt>
			<dd>{day(q.validUntil)}</dd>{/if}
	</dl>

	<table class="w-full border-collapse text-sm">
		<thead>
			<tr class="border-b-2 text-left">
				<th class="py-1 pr-2">#</th>
				<th class="py-1 pr-2">Description</th>
				<th class="py-1 pr-2 text-right">Qty</th>
				<th class="py-1 pr-2 text-right">Unit price</th>
				<th class="py-1 text-right">Amount</th>
			</tr>
		</thead>
		<tbody>
			{#each data.lines as l, i (l.id)}
				<tr class="border-b align-top">
					<td class="py-1 pr-2">{i + 1}</td>
					<td class="py-1 pr-2"
						>{l.item}<span class="block text-xs">{l.sku}{l.note ? ` · ${l.note}` : ''}</span></td
					>
					<td class="py-1 pr-2 text-right">{l.quantity} {l.unit}</td>
					<td class="py-1 pr-2 text-right">{formatETB(l.unitPrice)}</td>
					<td class="py-1 text-right">{formatETB(l.net)}</td>
				</tr>
			{/each}
		</tbody>
		<tfoot>
			<tr
				><td colspan="4" class="py-1 pr-2 text-right">Before tax</td><td class="py-1 text-right"
					>{formatETB(data.totals.net)}</td
				></tr
			>
			{#if data.totals.vat || data.org.vatRegistered}
				<tr
					><td colspan="4" class="py-1 pr-2 text-right">VAT</td><td class="py-1 text-right"
						>{formatETB(data.totals.vat)}</td
					></tr
				>
			{/if}
			{#if data.totals.tot}
				<tr
					><td colspan="4" class="py-1 pr-2 text-right">TOT</td><td class="py-1 text-right"
						>{formatETB(data.totals.tot)}</td
					></tr
				>
			{/if}
			<tr class="text-base font-bold"
				><td colspan="4" class="py-1 pr-2 text-right">Total</td><td class="py-1 text-right"
					>{formatETB(data.totals.gross)}</td
				></tr
			>
		</tfoot>
	</table>

	<p class="text-sm"><strong>Amount in words:</strong> {data.inWords}</p>
	{#if q.terms}<p class="text-sm whitespace-pre-line"><strong>Terms:</strong> {q.terms}</p>{/if}
	{#if q.note}<p class="text-sm whitespace-pre-line">{q.note}</p>{/if}
	<p class="text-xs">This is a proforma invoice: not a tax invoice, and not a receipt.</p>

	<div class="mt-12 grid grid-cols-2 gap-6 text-sm">
		<div class="border-t pt-1">Prepared by</div>
		<div class="border-t pt-1">Authorised signature and stamp</div>
	</div>
</PrintSheet>
