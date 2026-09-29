<script lang="ts">
	import PrintSheet from '@nahu/admin-kit/components/PrintSheet.svelte';
	import { formatETB, formatEthiopianDate } from '@nahu/admin-kit/global';
	import { fileUrl } from '@nahu/admin-kit/files';

	let { data } = $props();
	const doc = $derived(data.doc);
	const isReturn = $derived(doc.type === 'sales_return');
	/** What the paper is called: a tax invoice where VAT is charged, a sales invoice otherwise. */
	const title = $derived(
		isReturn ? 'Credit Note' : data.org.vatRegistered ? 'Tax Invoice' : 'Sales Invoice'
	);
	const day = (d: string) => `${formatEthiopianDate(new Date(`${d}T12:00:00+03:00`))} (${d})`;
</script>

<svelte:head>
	<title>{title} {doc.number}</title>
</svelte:head>

<PrintSheet
	branch={{ name: data.org.name, address: data.branch.address, phone: data.branch.phone }}
	fallbackName={data.org.name}
>
	<section class="flex items-start justify-between gap-6">
		<div class="flex flex-col gap-1">
			<h1 class="text-xl font-bold">{title}</h1>
			<p>No. <strong>{doc.number}</strong></p>
			<p class="text-sm">{day(doc.docDate)}</p>
			{#if data.org.tin}<p class="text-sm">Seller TIN <strong>{data.org.tin}</strong></p>{/if}
			{#if !data.org.vatRegistered && data.org.totRate !== null}
				<p class="text-xs">Not VAT-registered · turnover tax (TOT) payer</p>
			{/if}
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
		<dt class="font-semibold">Bill to</dt>
		<dd>
			{#if data.buyer}
				{data.buyer.name}{data.buyer.tin ? `, TIN ${data.buyer.tin}` : ''}{data.buyer.address
					? `, ${data.buyer.address}`
					: ''}{data.buyer.phone ? `, ${data.buyer.phone}` : ''}
			{:else}
				Cash customer
			{/if}
		</dd>
		<dt class="font-semibold">Sold at</dt>
		<dd>{data.branch.name}</dd>
		{#if data.quoteNumber}
			<dt class="font-semibold">Against proforma</dt>
			<dd>{data.quoteNumber}</dd>
		{/if}
		{#if doc.reference && doc.reference !== data.quoteNumber}
			<dt class="font-semibold">Reference</dt>
			<dd>{doc.reference}</dd>
		{/if}
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
					<td class="py-1 pr-2">
						{l.item}
						<span class="block text-xs"
							>{l.sku}{l.serials ? ` · S/N ${l.serials.split('\n').join(', ')}` : ''}</span
						>
					</td>
					<td class="py-1 pr-2 text-right">{l.quantity} {l.unit}</td>
					<td class="py-1 pr-2 text-right">{l.unitPrice == null ? '' : formatETB(l.unitPrice)}</td>
					<td class="py-1 text-right">{formatETB(l.net)}</td>
				</tr>
			{/each}
		</tbody>
		{#if data.totals}
			<tfoot>
				<tr>
					<td colspan="4" class="py-1 pr-2 text-right">Before tax</td>
					<td class="py-1 text-right">{formatETB(data.totals.net)}</td>
				</tr>
				{#if data.totals.vat || data.org.vatRegistered}
					<tr>
						<td colspan="4" class="py-1 pr-2 text-right">VAT</td>
						<td class="py-1 text-right">{formatETB(data.totals.vat)}</td>
					</tr>
				{/if}
				{#if data.totals.tot}
					<tr>
						<td colspan="4" class="py-1 pr-2 text-right">TOT</td>
						<td class="py-1 text-right">{formatETB(data.totals.tot)}</td>
					</tr>
				{/if}
				<tr class="text-base font-bold">
					<td colspan="4" class="py-1 pr-2 text-right">Total</td>
					<td class="py-1 text-right">{formatETB(data.totals.gross)}</td>
				</tr>
			</tfoot>
		{/if}
	</table>

	<p class="text-sm"><strong>Amount in words:</strong> {data.inWords}</p>

	{#if data.payments.length || data.balance}
		<section class="text-sm">
			{#each data.payments as p (p.id)}
				<p>
					{isReturn ? 'Refunded' : 'Paid'}
					{formatETB(p.amount)}{p.method ? ` by ${p.method}` : ''}{p.reference
						? `, ref. ${p.reference}`
						: ''}{p.withheld ? `; ${formatETB(p.withheld)} withheld` : ''}
				</p>
			{/each}
			{#if data.balance > 0}<p><strong>Balance due: {formatETB(data.balance)}</strong></p>{/if}
		</section>
	{/if}

	{#if doc.fiscalReceiptNumber || doc.einvoiceIrn}
		<section class="flex items-start justify-between gap-6 text-sm">
			<div>
				{#if doc.fiscalReceiptNumber}
					<p>
						FS No. <strong>{doc.fiscalReceiptNumber}</strong>{doc.fiscalMachineCode
							? ` · MRC ${doc.fiscalMachineCode}`
							: ''}
					</p>
				{/if}
				{#if doc.einvoiceIrn}<p class="break-all">IRN {doc.einvoiceIrn}</p>{/if}
			</div>
			{#if data.qr}<img src={data.qr} alt="E-invoice QR code" class="size-28" />{/if}
		</section>
	{/if}
	{#if !doc.fiscalReceiptNumber}
		<p class="text-xs">This invoice is valid with the fiscal receipt of the sale.</p>
	{/if}

	<div class="mt-12 grid grid-cols-2 gap-6 text-sm">
		<div class="border-t pt-1">Prepared by<br />{data.seller ?? ''}</div>
		<div class="border-t pt-1">Received by (customer)</div>
	</div>
</PrintSheet>
