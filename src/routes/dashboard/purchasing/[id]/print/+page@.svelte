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
		RIGHT
	} from '$lib/table';
	import PrintSheet from '@nahu/admin-kit/components/PrintSheet.svelte';
	import { formatETB } from '@nahu/admin-kit/global';
	import { fileUrl } from '@nahu/admin-kit/files';
	import { printedDay } from '$lib/format';
	import { m } from '$lib/paraglide/messages.js';

	let { data } = $props();

	const order = $derived(data.order);
	const total = $derived(data.lines.reduce((s, l) => s + l.value, 0));
	const day = printedDay;

	type Line = (typeof data.lines)[number];
	const columns: ColumnDef<Line>[] = [
		indexColumn<Line>(),
		column<Line>('item', m.common_item, ({ row: { original: l } }) =>
			stackedCell(l.item, joined(l.sku, l.note))
		),
		quantityColumn<Line>('quantity', m.common_quantity),
		moneyColumn<Line>('unitPrice', m.purchasing_mail_col_unit_price),
		column<Line>(
			'value',
			m.purchasing_col_amount,
			({ row: { original: l } }) => (l.unitPrice == null ? '' : formatETB(l.value)),
			RIGHT
		)
	];
</script>

<svelte:head>
	<title>{order.number ?? m.purchasing_print_draft()} · {m.purchasing_print_title()}</title>
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
			<h1 class="text-xl font-bold">{m.purchasing_print_title()}</h1>
			<p>
				{m.purchasing_print_no()}
				<strong>{order.number ?? m.purchasing_print_not_placed({ id: order.id })}</strong>
			</p>
			{#if data.org.tin}<p class="text-sm">TIN {data.org.tin}</p>{/if}
		</div>
		{#if data.org.logo}
			<img
				src={fileUrl(data.org.logo)}
				alt={m.purchasing_logo_alt({ name: data.org.name })}
				class="h-20 max-w-48 object-contain"
			/>
		{/if}
	</section>

	<dl class="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
		<dt class="font-semibold">{m.purchasing_print_to()}</dt>
		<dd>
			{data.details.supplier}, {data.details.supplierPhone}{data.supplier.tin
				? `, TIN ${data.supplier.tin}`
				: ''}{data.supplier.address ? `, ${data.supplier.address}` : ''}
		</dd>
		<dt class="font-semibold">{m.purchasing_f_order_date()}</dt>
		<dd>{day(order.orderDate)}</dd>
		{#if order.expectedDate}
			<dt class="font-semibold">{m.purchasing_print_deliver_by()}</dt>
			<dd>{day(order.expectedDate)}</dd>
		{/if}
		<dt class="font-semibold">{m.purchasing_f_deliver_to()}</dt>
		<dd>{data.details.location}, {data.details.branch}</dd>
		{#if order.reference}
			<dt class="font-semibold">{m.purchasing_print_your_reference()}</dt>
			<dd>{order.reference}</dd>
		{/if}
	</dl>

	<DataTable
		variant="print"
		data={data.lines}
		{columns}
		summary={[{ label: m.common_total(), value: formatETB(total), strong: true }]}
	/>

	{#if order.note}<p class="text-sm whitespace-pre-line">
			{m.purchasing_print_note({ note: order.note })}
		</p>{/if}
	<p class="text-sm">{m.purchasing_print_quote_number()}</p>

	<div class="mt-12 grid grid-cols-2 gap-6 text-sm">
		<div class="border-t pt-1">{m.purchasing_print_ordered_by()}</div>
		<div class="border-t pt-1">{m.purchasing_print_approved_by()}</div>
	</div>
</PrintSheet>
