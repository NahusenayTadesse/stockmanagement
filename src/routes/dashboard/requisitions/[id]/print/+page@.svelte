<script lang="ts">
	import DataTable from '@nahu/admin-kit/components/Table/data-table.svelte';
	import type { ColumnDef } from '@tanstack/table-core';
	import { column, indexColumn, joined, quantityColumn, stackedCell, RIGHT } from '$lib/table';
	import PrintSheet from '@nahu/admin-kit/components/PrintSheet.svelte';
	import { fileUrl } from '@nahu/admin-kit/files';
	import { REQUISITION_STATUS_LABELS } from '$lib/schemas/requisitions';
	import { printedDay, qty } from '$lib/format';
	import { m } from '$lib/paraglide/messages.js';

	let { data } = $props();

	const req = $derived(data.req);
	const day = printedDay;

	type Line = (typeof data.lines)[number];
	const columns: ColumnDef<Line>[] = [
		indexColumn<Line>(),
		column<Line>('item', m.common_item, ({ row: { original: l } }) =>
			stackedCell(l.item, joined(l.sku, l.note))
		),
		quantityColumn<Line>('quantity', m.purchasing_col_requested),
		column<Line>(
			'approvedQuantity',
			m.purchasing_col_approved,
			({ row: { original: l } }) =>
				l.approvedQuantity === null ? '' : qty(l.approvedQuantity, l.unit),
			RIGHT
		),
		// Left blank, for the storekeeper to write in what was handed over.
		{ id: 'issued', header: m.purchasing_col_issued(), cell: () => '', meta: { align: 'right' } }
	];
</script>

<svelte:head>
	<title>{req.number ?? m.purchasing_print_draft()} · {m.purchasing_req_print_title()}</title>
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
			<h1 class="text-xl font-bold">{m.purchasing_req_print_title()}</h1>
			<p>
				{m.purchasing_print_no()}
				<strong>{req.number ?? m.purchasing_req_print_not_submitted({ id: req.id })}</strong>
			</p>
			<p class="text-sm">{REQUISITION_STATUS_LABELS[req.status]}</p>
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
		<dt class="font-semibold">{m.purchasing_req_print_department()}</dt>
		<dd>{req.department}</dd>
		<dt class="font-semibold">{m.purchasing_col_from_store()}</dt>
		<dd>{data.details.location}, {data.details.branch}</dd>
		<dt class="font-semibold">{m.common_date()}</dt>
		<dd>{day(req.requestDate)}</dd>
		{#if req.neededBy}
			<dt class="font-semibold">{m.purchasing_col_needed_by()}</dt>
			<dd>{day(req.neededBy)}</dd>
		{/if}
		{#if data.details.issueNumber}
			<dt class="font-semibold">{m.purchasing_req_print_issue_voucher()}</dt>
			<dd>{data.details.issueNumber}</dd>
		{/if}
	</dl>

	<DataTable variant="print" data={data.lines} {columns} />

	{#if req.note}<p class="text-sm whitespace-pre-line">
			{m.purchasing_print_note({ note: req.note })}
		</p>{/if}
	{#if req.decisionNote}<p class="text-sm whitespace-pre-line">
			{m.purchasing_req_print_approver_note({ note: req.decisionNote })}
		</p>{/if}

	<div class="mt-12 grid grid-cols-4 gap-6 text-sm">
		<div class="border-t pt-1">
			{m.purchasing_req_print_requested_by()}<br /><span class="text-xs"
				>{data.details.submittedBy ?? ''}</span
			>
		</div>
		<div class="border-t pt-1">
			{m.purchasing_print_approved_by()}<br /><span class="text-xs"
				>{data.details.decidedBy ?? ''}</span
			>
		</div>
		<div class="border-t pt-1">{m.purchasing_req_print_issued_by()}</div>
		<div class="border-t pt-1">{m.purchasing_req_print_received_by()}</div>
	</div>
</PrintSheet>
