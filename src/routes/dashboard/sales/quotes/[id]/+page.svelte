<script lang="ts">
	import BigText from '@nahu/admin-kit/components/Table/bigText.svelte';
	import SmsDialog from '$lib/components/SmsDialog.svelte';
	import { enhance } from '$app/forms';
	import PageHeader from '@nahu/admin-kit/components/PageHeader.svelte';
	import PageSection from '@nahu/admin-kit/components/PageSection.svelte';
	import Notice from '@nahu/admin-kit/components/Notice.svelte';
	import PostButton from '$lib/components/PostButton.svelte';
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
	import { formatETB } from '@nahu/admin-kit/global';
	import {
		quoteHeader,
		quoteLineAdd,
		quoteLineEdit,
		QUOTE_STATUS_LABELS
	} from '$lib/schemas/quotes';
	import QuoteHeaderFields from '../QuoteHeaderFields.svelte';
	import { DOCUMENT_STATUS_LABELS, ethiopianDay } from '$lib/format';
	import { m } from '$lib/paraglide/messages.js';

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
		{
			name: 'itemId',
			label: m.common_item(),
			type: 'reference',
			options: 'items',
			display: 'item'
		},
		{ name: 'quantity', label: m.common_quantity(), type: 'number' },
		{
			name: 'uomId',
			label: m.common_unit(),
			type: 'reference',
			options: 'units',
			display: 'unit',
			picker: 'select',
			required: false
		},
		{
			name: 'unitPrice',
			label: m.sales_price_before_tax_hint(),
			type: 'money',
			required: false
		},
		{ name: 'gross', label: m.sales_with_tax(), type: 'money', required: false, inForm: false },
		{ name: 'note', label: m.common_note(), type: 'text', required: false, long: true }
	];
	const day = ethiopianDay;
	const buyerName = $derived(data.buyer?.name ?? q.buyerName ?? '—');
	const buyerTin = $derived(data.buyer?.tin ?? q.buyerTin);
	const subtitle = $derived(
		`${m.sales_for_buyer({ name: buyerName })}${buyerTin ? m.sales_tin_paren({ tin: buyerTin }) : ''} · ` +
			`${day(q.quoteDate)}${q.validUntil ? ` · ${m.sales_valid_until_date({ date: day(q.validUntil) })}` : ''}`
	);
</script>

<div class="flex flex-col gap-6">
	<PageHeader
		eyebrow={m.sales_proforma_invoice()}
		title={q.number ?? m.sales_draft_number({ id: q.id })}
		tabTitle={q.number ?? m.sales_draft_quote_title({ id: q.id })}
		description={subtitle}
	>
		{#snippet badges()}
			<Badge variant={q.status === 'cancelled' ? 'destructive' : 'secondary'}
				>{data.expired ? QUOTE_STATUS_LABELS.expired : QUOTE_STATUS_LABELS[q.status]}</Badge
			>
		{/snippet}
		{#snippet actions()}
			<Button
				href={resolve('/dashboard/sales/quotes/[id]/print', { id: String(q.id) })}
				target="_blank"
				variant="outline"><Printer /> {m.common_print()}</Button
			>
			{#if data.editable && data.canManage}
				<DialogComp
					bind:open={editOpen}
					title={m.sales_edit_quote()}
					variant="outline"
					IconComp={Pencil}
				>
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
						<Button type="submit" form="quote-header">{m.common_save()}</Button>
					</form>
				</DialogComp>
				{#if data.canText && data.lines.rows.length}
					<SmsDialog
						action="?/sms"
						phone={data.buyer?.phone ?? q.buyerPhone}
						preview={m.sales_quote_sms_preview()}
					/>
				{/if}
				{#if data.buyer?.email}
					<PostButton
						action="?/email"
						icon={Mail}
						label={m.sales_email()}
						busyLabel={m.common_sending()}
						disabled={!data.lines.rows.length}
					/>
				{/if}
				{#if q.status === 'draft'}
					<PostButton
						action="?/markSent"
						icon={Send}
						label={m.sales_mark_sent()}
						disabled={!data.lines.rows.length}
					/>
				{/if}
				{#if q.status === 'sent'}
					<PostButton action="?/accept" icon={Check} label={m.sales_accepted_button()} />
				{/if}
				<PostButton action="?/cancel" icon={Ban} label={m.common_cancel()} />
			{/if}
		{/snippet}
	</PageHeader>

	{#if data.held.length}
		<Notice title={m.sales_stock_held()}>
			<p class="mb-2 text-muted-foreground">
				{q.validUntil ? m.sales_stock_held_intro_dated() : m.sales_stock_held_intro()}
			</p>
			<ul class="list-inside list-disc">
				{#each data.held as h (h.id)}
					<li>
						{m.sales_held_line({
							quantity: h.quantity,
							unit: h.unit,
							item: h.item,
							location: h.location
						})}
					</li>
				{/each}
			</ul>
		</Notice>
	{:else if data.reserves && q.status === 'accepted' && !q.locationId}
		<Notice tone="warning">{m.sales_no_stock_held()}</Notice>
	{/if}

	{#if data.sale}
		<Notice tone="success">
			{m.sales_became_sale()}
			<a
				class="font-medium underline"
				href={resolve('/dashboard/stock/documents/[id]', { id: String(data.sale.id) })}
				>{data.sale.number ?? m.sales_draft_lower({ id: data.sale.id })}</a
			>
			({DOCUMENT_STATUS_LABELS[data.sale.status]}).
		</Notice>
	{:else if data.editable && data.canManage && data.canSell && data.lines.rows.length}
		<form
			method="POST"
			action="?/convert"
			use:enhance
			class="flex flex-wrap items-end gap-2 rounded-md border p-3"
		>
			<p class="w-full text-sm text-muted-foreground">
				{m.sales_convert_intro()}
			</p>
			{#if !q.locationId}
				<label class="flex flex-col gap-1 text-sm">
					{m.sales_goods_from_label()}
					<select
						name="locationId"
						bind:value={convertLocation}
						class="h-9 rounded-md border bg-background px-2"
						required
					>
						<option value={0} disabled>{m.sales_choose()}</option>
						{#each data.locations as l (l.value)}<option value={l.value}>{l.name}</option>{/each}
					</select>
				</label>
			{/if}
			<Button type="submit"><ShoppingCart /> {m.sales_make_it_sale()}</Button>
			{#if data.expired}<span class="text-sm text-amber-600">{m.sales_past_date()}</span>{/if}
		</form>
	{/if}

	<PageSection title={m.sales_lines()}>
		<LookupSection
			config={{ entity: m.sales_line(), plural: m.sales_lines(), fields }}
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
			<dt class="text-muted-foreground">{m.sales_pos_before_tax()}</dt>
			<dd class="text-right">{formatETB(data.totals.net)}</dd>
			{#if data.totals.vat}
				<dt class="text-muted-foreground">{m.sales_vat()}</dt>
				<dd class="text-right">{formatETB(data.totals.vat)}</dd>
			{/if}
			{#if data.totals.tot}
				<dt class="text-muted-foreground">{m.sales_tot()}</dt>
				<dd class="text-right">{formatETB(data.totals.tot)}</dd>
			{/if}
			<dt class="font-semibold">{m.common_total()}</dt>
			<dd class="text-right font-semibold">{formatETB(data.totals.gross)}</dd>
		</dl>
	</PageSection>

	{#if q.terms || q.note}
		<div class="flex flex-col gap-1 text-sm">
			{#if q.terms}<p>
					<strong>{m.sales_terms_colon()}</strong>
					<BigText text={q.terms} max={120} />
				</p>{/if}
			{#if q.note}<p>
					<strong>{m.sales_note_colon()}</strong>
					<BigText text={q.note} max={120} />
				</p>{/if}
		</div>
	{/if}
</div>
