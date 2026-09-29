<script lang="ts">
	import DataTable from '@nahu/admin-kit/components/Table/data-table.svelte';
	import type { ColumnDef } from '@tanstack/table-core';
	import { column, indexColumn, quantityColumn, stackedCell, taxSummary, RIGHT } from '$lib/table';
	import { m } from '$lib/paraglide/messages.js';
	import PrintSheet from '@nahu/admin-kit/components/PrintSheet.svelte';
	import { formatETB, formatEthiopianDate } from '@nahu/admin-kit/global';
	import { fileUrl } from '@nahu/admin-kit/files';
	import { ADJUSTMENT_REASONS } from '$lib/format';

	let { data } = $props();

	const doc = $derived(data.doc);

	const TITLES = {
		receipt: m.stock_print_grn(),
		issue: m.stock_print_siv(),
		transfer: m.stock_print_transfer(),
		adjustment: m.stock_print_adjustment(),
		sales_return: m.stock_print_sales_return(),
		purchase_return: m.stock_print_purchase_return()
	} as const;

	const withCost = $derived(
		doc.type === 'receipt' || doc.type === 'adjustment' || doc.type === 'purchase_return'
	);
	/** A sale or a customer return: priced lines print their price, and the voucher its total. */
	const withPrice = $derived(
		(doc.type === 'issue' || doc.type === 'sales_return') &&
			data.lines.some((l) => l.unitPrice !== null)
	);
	/** VAT, when there is any: before VAT, VAT, and the total, as on a tax invoice. */
	const vat = $derived(data.totals?.vat ?? 0);
	const priceOf = (l: (typeof data.lines)[number]) => (withPrice ? l.unitPrice : l.unitCost);
	const total = $derived(
		data.lines.reduce((sum, l) => sum + (priceOf(l) ?? 0) * Math.abs(l.quantity), 0)
	);

	type Line = (typeof data.lines)[number];
	const columns = $derived<ColumnDef<Line>[]>([
		indexColumn<Line>(),
		column<Line>('item', m.common_item, ({ row: { original: l } }) => stackedCell(l.item, l.sku)),
		column<Line>(
			'lotNumber',
			m.stock_lot_serials,
			({ row: { original: l } }) =>
				stackedCell(
					l.lotNumber ?? l.pickedLot ?? '',
					l.expiryDate && m.stock_exp({ date: l.expiryDate }),
					l.serials?.split('\n').join(', ')
				),
			{ class: 'text-xs' }
		),
		quantityColumn<Line>('quantity', m.common_quantity),
		...(withCost || withPrice
			? [
					column<Line>(
						'unitCost',
						withPrice ? m.stock_unit_price : m.stock_col_unit_cost,
						({ row: { original: l } }) => (priceOf(l) == null ? '' : formatETB(priceOf(l)!)),
						RIGHT
					),
					column<Line>(
						'amount' as keyof Line & string,
						m.stock_amount,
						({ row: { original: l } }) =>
							priceOf(l) == null ? '' : formatETB(priceOf(l)! * Math.abs(l.quantity)),
						RIGHT
					)
				]
			: [])
	]);
	/** Before tax and the tax, when there is any; then the total. */
	const summary = $derived(
		withCost || withPrice
			? taxSummary({
					net: data.totals?.net ?? total,
					vat,
					tot: data.totals?.tot ?? 0,
					gross: vat || data.totals?.tot ? (data.totals?.gross ?? total) : total
				})
			: []
	);
</script>

<svelte:head>
	<title>{doc.number ?? m.stock_draft()} · {TITLES[doc.type]}</title>
</svelte:head>

<PrintSheet
	branch={{ name: doc.org, address: doc.branchAddress, phone: doc.branchPhone }}
	fallbackName={doc.org}
>
	<section class="flex items-start justify-between gap-6">
		<div class="flex flex-col gap-1">
			<h1 class="text-xl font-bold">
				{doc.status === 'in_transit' ? m.stock_dispatch_note() : TITLES[doc.type]}
			</h1>
			{#if doc.status === 'in_transit'}<p class="text-sm">
					{m.stock_in_transit_not_received()}
				</p>{/if}
			<p>
				{m.stock_no()}
				<strong>{doc.number ?? m.stock_draft_not_posted({ id: doc.id })}</strong>
			</p>
			{#if doc.tin}<p class="text-sm">TIN {doc.tin}</p>{/if}
		</div>
		{#if doc.logo}
			<img
				src={fileUrl(doc.logo)}
				alt={m.stock_logo_alt({ name: doc.org })}
				class="h-20 max-w-48 object-contain"
			/>
		{/if}
	</section>

	<dl class="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
		<dt class="font-semibold">{m.common_date()}</dt>
		<dd>{formatEthiopianDate(new Date(doc.docDate))} ({doc.docDate})</dd>
		<dt class="font-semibold">{m.common_branch()}</dt>
		<dd>{doc.branch}</dd>
		{#if doc.from}<dt class="font-semibold">{m.stock_col_from()}</dt>
			<dd>{doc.from}</dd>{/if}
		{#if doc.to}<dt class="font-semibold">{m.stock_col_to()}</dt>
			<dd>{doc.to}</dd>{/if}
		{#if doc.supplier}
			<dt class="font-semibold">{m.stock_supplier()}</dt>
			<dd>
				{doc.supplier}{doc.supplierPhone ? `, ${doc.supplierPhone}` : ''}{doc.supplierTin
					? `, TIN ${doc.supplierTin}`
					: ''}
			</dd>
		{/if}
		{#if doc.customer}
			<dt class="font-semibold">{m.stock_customer()}</dt>
			<dd>
				{doc.customer}{doc.customerPhone ? `, ${doc.customerPhone}` : ''}{doc.customerTin
					? `, TIN ${doc.customerTin}`
					: ''}
			</dd>
		{/if}
		{#if doc.party}
			<dt class="font-semibold">{m.stock_issued_to()}</dt>
			<dd>{doc.party}</dd>
		{/if}
		{#if doc.reference}<dt class="font-semibold">{m.common_reference()}</dt>
			<dd>{doc.reference}</dd>{/if}
		{#if doc.reason}<dt class="font-semibold">{m.stock_reason()}</dt>
			<dd>
				{ADJUSTMENT_REASONS.find((r) => r.value === doc.reason)?.name ?? doc.reason}
			</dd>{/if}
		{#if doc.driverName || doc.vehiclePlate}
			<dt class="font-semibold">{m.stock_carried_by()}</dt>
			<dd>
				{[doc.driverName, doc.vehiclePlate && m.stock_plate({ plate: doc.vehiclePlate })]
					.filter(Boolean)
					.join(', ')}
			</dd>
		{/if}
		{#if doc.currency}
			<dt class="font-semibold">{m.stock_currency()}</dt>
			<dd>
				{m.stock_currency_print({ currency: doc.currency, rate: String(doc.exchangeRate) })}
			</dd>
		{/if}
	</dl>

	<DataTable variant="print" data={data.lines} {columns} {summary} />

	{#if doc.paidAmount != null && doc.paidStatus !== 'void'}
		<p class="text-sm">
			<strong>{m.stock_payment_colon()}</strong>
			{m.stock_paid_on({ amount: formatETB(doc.paidAmount), date: String(doc.paidOn) })}{doc.paidBy
				? m.stock_paid_by({ method: doc.paidBy })
				: ''}{doc.paidReference ? m.stock_paid_ref({ ref: doc.paidReference }) : ''}{doc.paidReceipt
				? m.stock_paid_receipt({ number: doc.paidReceipt })
				: ''}.
		</p>
	{/if}
	{#if doc.note}<p class="text-sm">{m.stock_note_colon({ note: doc.note })}</p>{/if}

	{#if data.fiscal.fsNumber || data.fiscal.irn}
		<section class="flex items-start justify-between gap-6 text-sm">
			<div class="flex flex-col gap-1">
				{#if data.fiscal.fsNumber}
					<p>
						FS No. <strong>{data.fiscal.fsNumber}</strong>{data.fiscal.machineCode
							? ` · MRC ${data.fiscal.machineCode}`
							: ''}
					</p>
				{/if}
				{#if data.fiscal.irn}<p class="break-all">IRN {data.fiscal.irn}</p>{/if}
			</div>
			{#if data.fiscal.qrImage}
				<img src={data.fiscal.qrImage} alt={m.stock_einvoice_qr_alt()} class="size-28" />
			{/if}
		</section>
	{/if}

	<div class="mt-12 grid grid-cols-3 gap-6 text-sm">
		<div class="border-t pt-1">{m.stock_prepared_by()}<br />{doc.createdBy ?? ''}</div>
		<div class="border-t pt-1">
			{doc.type === 'receipt'
				? m.stock_delivered_by()
				: doc.driverName
					? m.stock_driver()
					: m.stock_received_by()}
			{#if doc.type === 'transfer' && doc.driverName}<br />{doc.driverName}{/if}
		</div>
		<div class="border-t pt-1">{m.stock_approved_by()}<br />{doc.postedBy ?? ''}</div>
	</div>
</PrintSheet>
