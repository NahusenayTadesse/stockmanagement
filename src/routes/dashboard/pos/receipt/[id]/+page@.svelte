<script lang="ts">
	import { onMount } from 'svelte';
	import { formatETB } from '@nahu/admin-kit/global';
	import { ethiopianDateTime } from '@nahu/admin-kit/tableCells';

	let { data } = $props();
	const doc = $derived(data.doc);

	// A receipt is for printing: open the dialog as soon as it is on screen.
	onMount(() => setTimeout(() => window.print(), 300));
</script>

<svelte:head>
	<title>Receipt {doc.number}</title>
</svelte:head>

<main class="receipt">
	<header>
		<strong class="big">{data.org.name}</strong>
		{#if data.org.tin}<div>TIN {data.org.tin}</div>{/if}
		<div>{data.branch.name}{data.branch.address ? `, ${data.branch.address}` : ''}</div>
		{#if data.branch.phone ?? data.org.phone}<div>
				Tel {data.branch.phone ?? data.org.phone}
			</div>{/if}
	</header>

	<div class="rule"></div>
	<div class="row">
		<span>{doc.type === 'sales_return' ? 'Refund' : 'Receipt'}</span><span>{doc.number}</span>
	</div>
	<div class="row">
		<span>{ethiopianDateTime(doc.postedAt ?? doc.createdAt)}</span><span>{data.seller ?? ''}</span>
	</div>
	{#if data.buyer}
		<div>Customer: {data.buyer.name}{data.buyer.tin ? `, TIN ${data.buyer.tin}` : ''}</div>
	{/if}
	<div class="rule"></div>

	{#each data.lines as l (l.id)}
		<div>{l.item}</div>
		<div class="row">
			<span>&nbsp;&nbsp;{l.quantity} {l.unit} × {formatETB(l.unitPrice)}</span>
			<span>{formatETB(l.net)}</span>
		</div>
		{#if l.listPrice && l.unitPrice !== null && l.listPrice > l.unitPrice}
			<div class="small">&nbsp;&nbsp;was {formatETB(l.listPrice)}</div>
		{/if}
		{#if l.serials}<div class="small">&nbsp;&nbsp;S/N {l.serials.split('\n').join(', ')}</div>{/if}
	{/each}

	<div class="rule"></div>
	{#if data.totals}
		{#if data.totals.vat || data.totals.tot}
			<div class="row"><span>Before tax</span><span>{formatETB(data.totals.net)}</span></div>
		{/if}
		{#if data.totals.vat}<div class="row">
				<span>VAT</span><span>{formatETB(data.totals.vat)}</span>
			</div>{/if}
		{#if data.totals.tot}<div class="row">
				<span>TOT</span><span>{formatETB(data.totals.tot)}</span>
			</div>{/if}
		<div class="row big"><span>TOTAL</span><span>{formatETB(data.totals.gross)}</span></div>
	{/if}
	{#each data.payments as p (p.id)}
		<div class="row">
			<span>{p.method ?? 'Paid'}{p.reference ? ` ${p.reference}` : ''}</span><span
				>{formatETB(p.amount)}</span
			>
		</div>
	{/each}
	{#if data.tendered}<div class="row">
			<span>Tendered</span><span>{formatETB(data.tendered)}</span>
		</div>{/if}
	{#if data.change}<div class="row">
			<span>Change</span><span>{formatETB(data.change)}</span>
		</div>{/if}
	{#if data.balance > 0}<div class="row">
			<span>On account</span><span>{formatETB(data.balance)}</span>
		</div>{/if}

	{#if doc.fiscalReceiptNumber || doc.einvoiceIrn}
		<div class="rule"></div>
		{#if doc.fiscalReceiptNumber}
			<div>
				FS No. {doc.fiscalReceiptNumber}{doc.fiscalMachineCode
					? ` · MRC ${doc.fiscalMachineCode}`
					: ''}
			</div>
		{/if}
		{#if doc.einvoiceIrn}<div class="small">IRN {doc.einvoiceIrn}</div>{/if}
		{#if data.qr}<img src={data.qr} alt="E-invoice QR code" class="qr" />{/if}
	{/if}
	{#if !doc.fiscalReceiptNumber}
		<div class="rule"></div>
		<div class="small center">Not a fiscal receipt. Ask for the fiscal receipt.</div>
	{/if}
	<div class="center">Thank you · እናመሰግናለን</div>
</main>

<style>
	.receipt {
		width: 72mm;
		margin: 0 auto;
		padding: 4mm 0;
		font-family: ui-monospace, 'DejaVu Sans Mono', monospace;
		font-size: 11px;
		line-height: 1.35;
		color: #000;
		background: #fff;
	}
	header {
		text-align: center;
	}
	.big {
		font-size: 14px;
		font-weight: 700;
	}
	.small {
		font-size: 10px;
	}
	.center {
		text-align: center;
	}
	.row {
		display: flex;
		justify-content: space-between;
		gap: 8px;
	}
	.rule {
		border-top: 1px dashed #000;
		margin: 4px 0;
	}
	.qr {
		display: block;
		width: 32mm;
		margin: 4px auto;
	}
	@media print {
		@page {
			size: 80mm auto;
			margin: 0;
		}
	}
</style>
