<script lang="ts">
	import PrintSheet from '@nahu/admin-kit/components/PrintSheet.svelte';
	import { formatETB, formatEthiopianDate } from '@nahu/admin-kit/global';
	import { fileUrl } from '@nahu/admin-kit/files';
	import { m } from '$lib/paraglide/messages.js';

	let { data } = $props();
	const doc = $derived(data.doc);
	const isReturn = $derived(doc.type === 'sales_return');
	/** What the paper is called: a tax invoice where VAT is charged, a sales invoice otherwise. */
	const title = $derived(
		isReturn
			? m.sales_credit_note()
			: data.org.vatRegistered
				? m.sales_tax_invoice()
				: m.sales_sales_invoice()
	);
	const day = (d: string) => `${formatEthiopianDate(new Date(`${d}T12:00:00+03:00`))} (${d})`;
</script>

<svelte:head>
	<title>{title} {doc.number ?? ''}</title>
</svelte:head>

<PrintSheet
	branch={{ name: data.org.name, address: data.branch.address, phone: data.branch.phone }}
	fallbackName={data.org.name}
>
	<section class="flex items-start justify-between gap-6">
		<div class="flex flex-col gap-1">
			<h1 class="text-xl font-bold">{title}</h1>
			<p>{m.sales_no()} <strong>{doc.number}</strong></p>
			<p class="text-sm">{day(doc.docDate)}</p>
			{#if data.org.tin}<p class="text-sm">
					{m.sales_seller_tin()} <strong>{data.org.tin}</strong>
				</p>{/if}
			{#if !data.org.vatRegistered && data.org.totRate !== null}
				<p class="text-xs">{m.sales_tot_payer()}</p>
			{/if}
		</div>
		{#if data.org.logo}
			<img
				src={fileUrl(data.org.logo)}
				alt={m.sales_logo_alt({ name: data.org.name })}
				class="h-20 max-w-48 object-contain"
			/>
		{/if}
	</section>

	<dl class="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
		<dt class="font-semibold">{m.sales_bill_to()}</dt>
		<dd>
			{#if data.buyer}
				{data.buyer.name}{data.buyer.tin ? `, ${m.sales_tin({ tin: data.buyer.tin })}` : ''}{data
					.buyer.address
					? `, ${data.buyer.address}`
					: ''}{data.buyer.phone ? `, ${data.buyer.phone}` : ''}
			{:else}
				{m.sales_cash_customer()}
			{/if}
		</dd>
		<dt class="font-semibold">{m.sales_sold_at()}</dt>
		<dd>{data.branch.name}</dd>
		{#if data.quoteNumber}
			<dt class="font-semibold">{m.sales_against_proforma()}</dt>
			<dd>{data.quoteNumber}</dd>
		{/if}
		{#if doc.reference && doc.reference !== data.quoteNumber}
			<dt class="font-semibold">{m.common_reference()}</dt>
			<dd>{doc.reference}</dd>
		{/if}
	</dl>

	<table class="w-full border-collapse text-sm">
		<thead>
			<tr class="border-b-2 text-left">
				<th class="py-1 pr-2">#</th>
				<th class="py-1 pr-2">{m.sales_description()}</th>
				<th class="py-1 pr-2 text-right">{m.sales_qty()}</th>
				<th class="py-1 pr-2 text-right">{m.sales_unit_price()}</th>
				<th class="py-1 text-right">{m.sales_amount()}</th>
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
					<td colspan="4" class="py-1 pr-2 text-right">{m.sales_pos_before_tax()}</td>
					<td class="py-1 text-right">{formatETB(data.totals.net)}</td>
				</tr>
				{#if data.totals.vat || data.org.vatRegistered}
					<tr>
						<td colspan="4" class="py-1 pr-2 text-right">{m.sales_vat()}</td>
						<td class="py-1 text-right">{formatETB(data.totals.vat)}</td>
					</tr>
				{/if}
				{#if data.totals.tot}
					<tr>
						<td colspan="4" class="py-1 pr-2 text-right">{m.sales_tot()}</td>
						<td class="py-1 text-right">{formatETB(data.totals.tot)}</td>
					</tr>
				{/if}
				<tr class="text-base font-bold">
					<td colspan="4" class="py-1 pr-2 text-right">{m.common_total()}</td>
					<td class="py-1 text-right">{formatETB(data.totals.gross)}</td>
				</tr>
			</tfoot>
		{/if}
	</table>

	<p class="text-sm"><strong>{m.sales_amount_in_words()}</strong> {data.inWords}</p>

	{#if data.payments.length || data.balance}
		<section class="text-sm">
			{#each data.payments as p (p.id)}
				<p>
					{isReturn
						? m.sales_refunded_by({ amount: formatETB(p.amount) })
						: m.sales_paid_amount({ amount: formatETB(p.amount) })}{p.method
						? m.sales_by_method({ method: p.method })
						: ''}{p.reference ? m.sales_ref({ reference: p.reference }) : ''}{p.withheld
						? m.sales_withheld_part({ amount: formatETB(p.withheld) })
						: ''}
				</p>
			{/each}
			{#if data.balance > 0}<p>
					<strong>{m.sales_balance_due({ amount: formatETB(data.balance) })}</strong>
				</p>{/if}
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
			{#if data.qr}<img src={data.qr} alt={m.sales_einvoice_qr()} class="size-28" />{/if}
		</section>
	{/if}
	{#if !doc.fiscalReceiptNumber}
		<p class="text-xs">{m.sales_valid_with_fiscal()}</p>
	{/if}

	<div class="mt-12 grid grid-cols-2 gap-6 text-sm">
		<div class="border-t pt-1">{m.sales_prepared_by()}<br />{data.seller ?? ''}</div>
		<div class="border-t pt-1">{m.sales_received_by_customer()}</div>
	</div>
</PrintSheet>
