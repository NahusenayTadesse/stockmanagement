<script lang="ts">
	import PrintSheet from '@nahu/admin-kit/components/PrintSheet.svelte';
	import { formatETB, formatEthiopianDate } from '@nahu/admin-kit/global';
	import { fileUrl } from '@nahu/admin-kit/files';
	import { qty } from '$lib/format';

	let { data } = $props();

	const doc = $derived(data.doc);

	const TITLES = {
		receipt: 'Goods Received Note',
		issue: 'Store Issue Voucher',
		transfer: 'Stock Transfer Note',
		adjustment: 'Stock Adjustment'
	} as const;

	const withCost = $derived(doc.type === 'receipt' || doc.type === 'adjustment');
	const total = $derived(
		data.lines.reduce((sum, l) => sum + (l.unitCost ?? 0) * Math.abs(l.quantity), 0)
	);
</script>

<svelte:head>
	<title>{doc.number ?? 'Draft'} · {TITLES[doc.type]}</title>
</svelte:head>

<PrintSheet
	branch={{ name: doc.org, address: doc.branchAddress, phone: doc.branchPhone }}
	fallbackName={doc.org}
>
	<section class="flex items-start justify-between gap-6">
		<div class="flex flex-col gap-1">
			<h1 class="text-xl font-bold">{TITLES[doc.type]}</h1>
			<p>No. <strong>{doc.number ?? `DRAFT ${doc.id} — not posted`}</strong></p>
			{#if doc.tin}<p class="text-sm">TIN {doc.tin}</p>{/if}
		</div>
		{#if doc.logo}
			<img src={fileUrl(doc.logo)} alt="{doc.org} logo" class="h-20 max-w-48 object-contain" />
		{/if}
	</section>

	<dl class="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
		<dt class="font-semibold">Date</dt>
		<dd>{formatEthiopianDate(new Date(doc.docDate))} ({doc.docDate})</dd>
		<dt class="font-semibold">Branch</dt>
		<dd>{doc.branch}</dd>
		{#if doc.from}<dt class="font-semibold">From</dt>
			<dd>{doc.from}</dd>{/if}
		{#if doc.to}<dt class="font-semibold">To</dt>
			<dd>{doc.to}</dd>{/if}
		{#if doc.supplier}
			<dt class="font-semibold">Supplier</dt>
			<dd>
				{doc.supplier}{doc.supplierPhone ? `, ${doc.supplierPhone}` : ''}{doc.supplierTin
					? `, TIN ${doc.supplierTin}`
					: ''}
			</dd>
		{/if}
		{#if doc.party}
			<dt class="font-semibold">Issued to</dt>
			<dd>{doc.party}</dd>
		{/if}
		{#if doc.reference}<dt class="font-semibold">Reference</dt>
			<dd>{doc.reference}</dd>{/if}
		{#if doc.reason}<dt class="font-semibold">Reason</dt>
			<dd class="capitalize">{doc.reason}</dd>{/if}
	</dl>

	<table class="w-full border-collapse text-sm">
		<thead>
			<tr class="border-b-2 text-left">
				<th class="py-1 pr-2">#</th>
				<th class="py-1 pr-2">Item</th>
				<th class="py-1 pr-2">Lot / serials</th>
				<th class="py-1 pr-2 text-right">Quantity</th>
				{#if withCost}
					<th class="py-1 pr-2 text-right">Unit cost</th>
					<th class="py-1 text-right">Amount</th>
				{/if}
			</tr>
		</thead>
		<tbody>
			{#each data.lines as line, i (line.id)}
				<tr class="border-b align-top">
					<td class="py-1 pr-2">{i + 1}</td>
					<td class="py-1 pr-2">{line.item}<br /><span class="text-xs">{line.sku}</span></td>
					<td class="py-1 pr-2 text-xs">
						{line.lotNumber ?? line.pickedLot ?? ''}
						{#if line.expiryDate}<br />exp {line.expiryDate}{/if}
						{#if line.serials}<br />{line.serials.split('\n').join(', ')}{/if}
					</td>
					<td class="py-1 pr-2 text-right">{qty(line.quantity, line.unit)}</td>
					{#if withCost}
						<td class="py-1 pr-2 text-right"
							>{line.unitCost == null ? '' : formatETB(line.unitCost)}</td
						>
						<td class="py-1 text-right">
							{line.unitCost == null ? '' : formatETB(line.unitCost * Math.abs(line.quantity))}
						</td>
					{/if}
				</tr>
			{/each}
		</tbody>
		{#if withCost}
			<tfoot>
				<tr class="font-semibold">
					<td colspan="5" class="py-1 pr-2 text-right">Total</td>
					<td class="py-1 text-right">{formatETB(total)}</td>
				</tr>
			</tfoot>
		{/if}
	</table>

	{#if doc.paidAmount != null && doc.paidStatus !== 'void'}
		<p class="text-sm">
			<strong>Payment:</strong>
			{formatETB(doc.paidAmount)} on {doc.paidOn}{doc.paidBy
				? ` by ${doc.paidBy}`
				: ''}{doc.paidReference ? `, ref. ${doc.paidReference}` : ''}{doc.paidReceipt
				? `, receipt ${doc.paidReceipt}`
				: ''}.
		</p>
	{/if}
	{#if doc.note}<p class="text-sm">Note: {doc.note}</p>{/if}

	<div class="mt-12 grid grid-cols-3 gap-6 text-sm">
		<div class="border-t pt-1">Prepared by<br />{doc.createdBy ?? ''}</div>
		<div class="border-t pt-1">{doc.type === 'receipt' ? 'Delivered by' : 'Received by'}</div>
		<div class="border-t pt-1">Approved by<br />{doc.postedBy ?? ''}</div>
	</div>
</PrintSheet>
