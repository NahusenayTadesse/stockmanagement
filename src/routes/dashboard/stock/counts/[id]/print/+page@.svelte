<script lang="ts">
	import DataTable from '@nahu/admin-kit/components/Table/data-table.svelte';
	import type { ColumnDef } from '@tanstack/table-core';
	import { column, indexColumn, joined, stackedCell, RIGHT } from '$lib/table';
	import { m } from '$lib/paraglide/messages.js';
	import PrintSheet from '@nahu/admin-kit/components/PrintSheet.svelte';
	import { fileUrl } from '@nahu/admin-kit/files';
	import { ethiopianDay, qty } from '$lib/format';

	let { data } = $props();

	type Line = (typeof data.lines)[number];
	const columns = $derived<ColumnDef<Line>[]>([
		indexColumn<Line>(),
		column<Line>('item', m.common_item, ({ row: { original: l } }) =>
			stackedCell(l.item, joined(l.sku, l.unit))
		),
		column<Line>(
			'lotNumber',
			m.stock_lot_expiry,
			({ row: { original: l } }) => joined(l.lotNumber, l.expiryDate),
			{ class: 'text-xs' }
		),
		...(data.showExpected
			? [
					column<Line>(
						'expected',
						m.stock_expected,
						({ row: { original: l } }) => qty(l.expected),
						RIGHT
					)
				]
			: []),
		// Left blank, wide enough to write the count in.
		{
			id: 'counted',
			header: m.stock_counted(),
			cell: () => '______________',
			meta: { align: 'right', class: 'w-32' }
		}
	]);
</script>

<svelte:head>
	<title>{m.stock_count_sheet_title({ id: data.count.id })}</title>
</svelte:head>

<PrintSheet
	branch={{ name: data.org.name, address: null, phone: null }}
	fallbackName={data.org.name}
>
	<section class="flex items-start justify-between gap-6">
		<div class="flex flex-col gap-1">
			<h1 class="text-xl font-bold">{m.stock_count_sheet_heading({ id: data.count.id })}</h1>
			<p>
				{data.location}{data.category ? ` · ${data.category}` : ''} ·
				{ethiopianDay(data.count.countDate)} ({data.count.countDate})
			</p>
			{#if data.count.blind}<p class="text-sm">
					{m.stock_blind_instruction()}
				</p>{/if}
		</div>
		{#if data.org.logo}<img
				src={fileUrl(data.org.logo)}
				alt=""
				class="h-16 max-w-40 object-contain"
			/>{/if}
	</section>

	<!-- Taller rows: room to write. -->
	<DataTable variant="print" data={data.lines} {columns} rowClass={() => '[&_td]:py-2'} />

	<p class="text-sm">
		{m.stock_found_not_on_sheet()}
	</p>
	<div class="h-24 border-b"></div>

	<div class="mt-10 grid grid-cols-3 gap-6 text-sm">
		<div class="border-t pt-1">{m.stock_counted_by()}</div>
		<div class="border-t pt-1">{m.stock_checked_by()}</div>
		<div class="border-t pt-1">{m.stock_date_and_time()}</div>
	</div>
</PrintSheet>
