<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import Ban from '@lucide/svelte/icons/ban';
	import Check from '@lucide/svelte/icons/check';
	import Mail from '@lucide/svelte/icons/mail';
	import Pencil from '@lucide/svelte/icons/pencil';
	import Printer from '@lucide/svelte/icons/printer';
	import Send from '@lucide/svelte/icons/send';
	import ShoppingCart from '@lucide/svelte/icons/shopping-cart';
	import LookupSection from '@nahu/admin-kit/components/lookup/LookupSection.svelte';
	import type { LookupField } from '@nahu/admin-kit/components/lookup/types';
	import { Badge } from '@nahu/admin-kit/components/ui/badge/index.js';
	import { Button } from '@nahu/admin-kit/components/ui/button/index.js';
	import DialogComp from '@nahu/admin-kit/formComponents/DialogComp.svelte';
	import Errors from '@nahu/admin-kit/formComponents/Errors.svelte';
	import { createForm } from '@nahu/admin-kit/forms/createForm';
	import { formatETB, formatEthiopianDate } from '@nahu/admin-kit/global';
	import {
		quoteHeader,
		quoteLineAdd,
		quoteLineEdit,
		QUOTE_STATUS_LABELS
	} from '$lib/schemas/quotes';
	import QuoteHeaderFields from '../QuoteHeaderFields.svelte';

	let { data } = $props();
	const q = $derived(data.quote);
	let editOpen = $state(false);
	let convertLocation = $state(0);

	// svelte-ignore state_referenced_locally
	const header = createForm(data.headerForm, quoteHeader, {
		resetForm: false,
		onUpdated({ form }) {
			if (form.message?.type === 'success') editOpen = false;
		}
	});
	const headerData = header.form;
	const headerErrors = header.errors;
	const headerAll = header.allErrors;

	const fields: LookupField[] = [
		{ name: 'itemId', label: 'Item', type: 'reference', options: 'items', display: 'item' },
		{ name: 'quantity', label: 'Quantity', type: 'number' },
		{
			name: 'uomId',
			label: 'Unit',
			type: 'reference',
			options: 'units',
			display: 'unit',
			picker: 'select',
			required: false
		},
		{
			name: 'unitPrice',
			label: 'Price before tax (empty: the customer’s price)',
			type: 'money',
			required: false
		},
		{ name: 'gross', label: 'With tax', type: 'money', required: false, inForm: false },
		{ name: 'note', label: 'Note', type: 'text', required: false }
	];
	const day = (d: string) => formatEthiopianDate(new Date(`${d}T12:00:00+03:00`));
	const buyerName = $derived(data.buyer?.name ?? q.buyerName ?? '—');
</script>

<svelte:head>
	<title>{q.number ?? `Draft proforma #${q.id}`}</title>
</svelte:head>

<div class="flex flex-col gap-6">
	<div class="flex flex-wrap items-start justify-between gap-4">
		<div class="flex flex-col gap-1">
			<p class="text-sm text-muted-foreground">Proforma invoice</p>
			<h1 class="flex items-center gap-2 text-2xl font-semibold">
				{q.number ?? `Draft #${q.id}`}
				<Badge variant={q.status === 'cancelled' ? 'destructive' : 'secondary'}
					>{data.expired ? 'Expired' : QUOTE_STATUS_LABELS[q.status]}</Badge
				>
			</h1>
			<p class="text-muted-foreground">
				For {buyerName}{(data.buyer?.tin ?? q.buyerTin)
					? ` (TIN ${data.buyer?.tin ?? q.buyerTin})`
					: ''} ·
				{day(q.quoteDate)}{q.validUntil ? ` · valid until ${day(q.validUntil)}` : ''}
			</p>
		</div>

		<div class="flex flex-wrap gap-2">
			<Button
				href={resolve('/dashboard/sales/quotes/[id]/print', { id: String(q.id) })}
				target="_blank"
				variant="outline"><Printer /> Print</Button
			>
			{#if data.editable && data.canManage}
				<DialogComp bind:open={editOpen} title="Edit proforma" variant="outline" IconComp={Pencil}>
					<form
						method="POST"
						action="?/editHeader"
						use:header.enhance
						id="quote-header"
						class="flex flex-col gap-4"
					>
						<Errors allErrors={$headerAll} />
						<QuoteHeaderFields
							form={headerData}
							errors={headerErrors}
							customers={data.customers}
							locations={data.locations}
						/>
						<Button type="submit" form="quote-header">Save</Button>
					</form>
				</DialogComp>
				{#if data.buyer?.email}
					<form method="POST" action="?/email" use:enhance>
						<Button type="submit" variant="outline" disabled={!data.lines.rows.length}
							><Mail /> Email</Button
						>
					</form>
				{/if}
				{#if q.status === 'draft'}
					<form method="POST" action="?/markSent" use:enhance>
						<Button type="submit" variant="outline" disabled={!data.lines.rows.length}
							><Send /> Mark sent</Button
						>
					</form>
				{/if}
				{#if q.status === 'sent'}
					<form method="POST" action="?/accept" use:enhance>
						<Button type="submit" variant="outline"><Check /> Accepted</Button>
					</form>
				{/if}
				<form method="POST" action="?/cancel" use:enhance>
					<Button type="submit" variant="outline"><Ban /> Cancel</Button>
				</form>
			{/if}
		</div>
	</div>

	{#if data.held.length}
		<div class="rounded-md border p-3 text-sm">
			<p class="font-medium">Stock held for this proforma</p>
			<p class="mb-2 text-muted-foreground">
				Other sales cannot take it until this one's sale is posted, or the proforma is cancelled
				{q.validUntil ? 'or runs out' : ''}.
			</p>
			<ul class="list-inside list-disc">
				{#each data.held as h (h.id)}
					<li>{h.quantity} {h.unit} {h.item} at {h.location}</li>
				{/each}
			</ul>
		</div>
	{:else if data.reserves && q.status === 'accepted' && !q.locationId}
		<p class="rounded-md border p-3 text-sm text-muted-foreground">
			No stock is held: choose the location the goods will come from, and it will be.
		</p>
	{/if}

	{#if data.sale}
		<p class="rounded-md border p-3 text-sm">
			Became sale
			<a
				class="font-medium underline"
				href={resolve('/dashboard/stock/documents/[id]', { id: String(data.sale.id) })}
				>{data.sale.number ?? `draft #${data.sale.id}`}</a
			>
			({data.sale.status}).
		</p>
	{:else if data.editable && data.canManage && data.canSell && data.lines.rows.length}
		<form
			method="POST"
			action="?/convert"
			use:enhance
			class="flex flex-wrap items-end gap-2 rounded-md border p-3"
		>
			<p class="w-full text-sm text-muted-foreground">
				The buyer placed the order? Make it a sale at these prices. It opens as a draft to check and
				post.
			</p>
			{#if !q.locationId}
				<label class="flex flex-col gap-1 text-sm">
					Goods from
					<select
						name="locationId"
						bind:value={convertLocation}
						class="h-9 rounded-md border bg-background px-2"
						required
					>
						<option value={0} disabled>Choose…</option>
						{#each data.locations as l (l.value)}<option value={l.value}>{l.name}</option>{/each}
					</select>
				</label>
			{/if}
			<Button type="submit"><ShoppingCart /> Make it a sale</Button>
			{#if data.expired}<span class="text-sm text-amber-600"
					>This proforma is past its date — check the prices.</span
				>{/if}
		</form>
	{/if}

	<section class="flex flex-col gap-2">
		<h2 class="text-xl font-semibold">Lines</h2>
		<LookupSection
			config={{ entity: 'Line', plural: 'Lines', fields }}
			rows={data.lines.rows}
			addForm={data.lines.addForm}
			editForm={data.lines.editForm}
			canDelete={data.editable && data.canManage}
			options={{ itemId: data.items, uomId: data.units }}
			actions={{ add: '?/addLine', edit: '?/editLine', delete: '?/deleteLine' }}
			schemas={{ add: quoteLineAdd, edit: quoteLineEdit }}
			readonly={!data.editable || !data.canManage}
		/>
		<dl class="ml-auto grid w-full max-w-xs grid-cols-2 gap-1 text-sm">
			<dt class="text-muted-foreground">Before tax</dt>
			<dd class="text-right">{formatETB(data.totals.net)}</dd>
			{#if data.totals.vat}
				<dt class="text-muted-foreground">VAT</dt>
				<dd class="text-right">{formatETB(data.totals.vat)}</dd>
			{/if}
			{#if data.totals.tot}
				<dt class="text-muted-foreground">TOT</dt>
				<dd class="text-right">{formatETB(data.totals.tot)}</dd>
			{/if}
			<dt class="font-semibold">Total</dt>
			<dd class="text-right font-semibold">{formatETB(data.totals.gross)}</dd>
		</dl>
	</section>

	{#if q.terms || q.note}
		<div class="flex flex-col gap-1 text-sm">
			{#if q.terms}<p class="whitespace-pre-line"><strong>Terms:</strong> {q.terms}</p>{/if}
			{#if q.note}<p class="whitespace-pre-line"><strong>Note:</strong> {q.note}</p>{/if}
		</div>
	{/if}
</div>
