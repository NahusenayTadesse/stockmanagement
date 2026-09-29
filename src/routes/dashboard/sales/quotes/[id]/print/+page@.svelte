<script lang="ts">
	import DataTable from '@nahu/admin-kit/components/Table/data-table.svelte';
	import type { ColumnDef } from '@tanstack/table-core';
	import {
		column,
		indexColumn,
		joined,
		moneyColumn,
		quantityColumn,
		stackedCell,
		taxSummary
	} from '$lib/table';
	import { printedDay } from '$lib/format';
	import PrintSheet from '@nahu/admin-kit/components/PrintSheet.svelte';
	import { fileUrl } from '@nahu/admin-kit/files';
	import { m } from '$lib/paraglide/messages.js';
	import { getLocale } from '$lib/paraglide/runtime';

	/** The Amharic name on an Amharic paper, where the item has one. */
	const amharic = getLocale() === 'am';

	let { data } = $props();
	const q = $derived(data.quote);
	const day = printedDay;

	type Line = (typeof data.lines)[number];
	const columns: ColumnDef<Line>[] = [
		indexColumn<Line>(),
		column<Line>('item', m.sales_description, ({ row: { original: l } }) =>
			stackedCell(amharic && l.itemAm ? l.itemAm : l.item, joined(l.sku, l.note))
		),
		quantityColumn<Line>('quantity', m.sales_qty),
		moneyColumn<Line>('unitPrice', m.sales_unit_price),
		moneyColumn<Line>('net', m.sales_amount)
	];
</script>

<svelte:head>
	<title
		>{m.sales_quote_print_title({ number: q.number ?? m.sales_draft_word({ id: q.id }) })}</title
	>
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
			<h1 class="text-xl font-bold">{m.sales_proforma_invoice_caps()}</h1>
			<p>{m.sales_no()} <strong>{q.number ?? m.sales_draft_caps({ id: q.id })}</strong></p>
			<p class="text-sm">{day(q.quoteDate)}</p>
			{#if data.org.tin}<p class="text-sm">{m.sales_tin({ tin: data.org.tin })}</p>{/if}
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
		<dt class="font-semibold">{m.sales_to()}</dt>
		<dd>
			{data.buyer.name ?? '—'}{data.buyer.tin
				? `, ${m.sales_tin({ tin: data.buyer.tin })}`
				: ''}{data.buyer.phone ? `, ${data.buyer.phone}` : ''}{data.buyer.address
				? `, ${data.buyer.address}`
				: ''}
		</dd>
		{#if q.reference}<dt class="font-semibold">{m.sales_your_reference()}</dt>
			<dd>{q.reference}</dd>{/if}
		{#if q.validUntil}<dt class="font-semibold">{m.sales_valid_until()}</dt>
			<dd>{day(q.validUntil)}</dd>{/if}
	</dl>

	<DataTable
		variant="print"
		data={data.lines}
		{columns}
		summary={taxSummary(data.totals, { vatRegistered: data.org.vatRegistered })}
	/>

	<p class="text-sm"><strong>{m.sales_amount_in_words()}</strong> {data.inWords}</p>
	{#if q.terms}<p class="text-sm whitespace-pre-line">
			<strong>{m.sales_terms_colon()}</strong>
			{q.terms}
		</p>{/if}
	{#if q.note}<p class="text-sm whitespace-pre-line">{q.note}</p>{/if}
	<p class="text-xs">{m.sales_not_tax_invoice()}</p>

	<div class="mt-12 grid grid-cols-2 gap-6 text-sm">
		<div class="border-t pt-1">{m.sales_prepared_by()}</div>
		<div class="border-t pt-1">{m.sales_signature_stamp()}</div>
	</div>
</PrintSheet>
