<script lang="ts">
	import PrintSheet from '@nahu/admin-kit/components/PrintSheet.svelte';
	import { formatEthiopianDate } from '@nahu/admin-kit/global';
	import { fileUrl } from '@nahu/admin-kit/files';
	import { REQUISITION_STATUS_LABELS } from '$lib/schemas/requisitions';
	import { qty } from '$lib/format';

	let { data } = $props();

	const req = $derived(data.req);
	const day = (d: string) => `${formatEthiopianDate(new Date(`${d}T12:00:00+03:00`))} (${d})`;
</script>

<svelte:head>
	<title>{req.number ?? 'Draft'} · Store Requisition</title>
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
			<h1 class="text-xl font-bold">Store Requisition</h1>
			<p>No. <strong>{req.number ?? `DRAFT ${req.id} — not submitted`}</strong></p>
			<p class="text-sm">{REQUISITION_STATUS_LABELS[req.status]}</p>
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
		<dt class="font-semibold">Requesting department</dt>
		<dd>{req.department}</dd>
		<dt class="font-semibold">From store</dt>
		<dd>{data.details.location}, {data.details.branch}</dd>
		<dt class="font-semibold">Date</dt>
		<dd>{day(req.requestDate)}</dd>
		{#if req.neededBy}
			<dt class="font-semibold">Needed by</dt>
			<dd>{day(req.neededBy)}</dd>
		{/if}
		{#if data.details.issueNumber}
			<dt class="font-semibold">Issue voucher</dt>
			<dd>{data.details.issueNumber}</dd>
		{/if}
	</dl>

	<table class="w-full border-collapse text-sm">
		<thead>
			<tr class="border-b-2 text-left">
				<th class="py-1 pr-2">#</th>
				<th class="py-1 pr-2">Item</th>
				<th class="py-1 pr-2 text-right">Requested</th>
				<th class="py-1 pr-2 text-right">Approved</th>
				<th class="py-1 text-right">Issued</th>
			</tr>
		</thead>
		<tbody>
			{#each data.lines as line, i (line.id)}
				<tr class="border-b align-top">
					<td class="py-1 pr-2">{i + 1}</td>
					<td class="py-1 pr-2">
						{line.item}<br /><span class="text-xs"
							>{line.sku}{line.note ? ` · ${line.note}` : ''}</span
						>
					</td>
					<td class="py-1 pr-2 text-right">{qty(line.quantity, line.unit)}</td>
					<td class="py-1 pr-2 text-right"
						>{line.approvedQuantity === null ? '' : qty(line.approvedQuantity, line.unit)}</td
					>
					<td class="py-1 text-right"></td>
				</tr>
			{/each}
		</tbody>
	</table>

	{#if req.note}<p class="text-sm whitespace-pre-line">Note: {req.note}</p>{/if}
	{#if req.decisionNote}<p class="text-sm whitespace-pre-line">
			Approver's note: {req.decisionNote}
		</p>{/if}

	<div class="mt-12 grid grid-cols-4 gap-6 text-sm">
		<div class="border-t pt-1">
			Requested by<br /><span class="text-xs">{data.details.submittedBy ?? ''}</span>
		</div>
		<div class="border-t pt-1">
			Approved by<br /><span class="text-xs">{data.details.decidedBy ?? ''}</span>
		</div>
		<div class="border-t pt-1">Issued by</div>
		<div class="border-t pt-1">Received by</div>
	</div>
</PrintSheet>
