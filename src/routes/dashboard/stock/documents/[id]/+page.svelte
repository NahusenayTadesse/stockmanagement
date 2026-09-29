<script lang="ts">
	import { m } from '$lib/paraglide/messages.js';
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import Check from '@lucide/svelte/icons/check';
	import Pencil from '@lucide/svelte/icons/pencil';
	import Printer from '@lucide/svelte/icons/printer';
	import X from '@lucide/svelte/icons/x';
	import Undo2 from '@lucide/svelte/icons/undo-2';
	import CircleAlert from '@lucide/svelte/icons/circle-alert';
	import Truck from '@lucide/svelte/icons/truck';
	import ShieldCheck from '@lucide/svelte/icons/shield-check';
	import DataTable from '@nahu/admin-kit/components/Table/data-table.svelte';
	import LookupSection from '@nahu/admin-kit/components/lookup/LookupSection.svelte';
	import type { LookupField } from '@nahu/admin-kit/components/lookup/types';
	import SingleTable from '@nahu/admin-kit/components/SingleTable.svelte';
	import * as Card from '@nahu/admin-kit/components/ui/card/index.js';
	import * as AlertDialog from '@nahu/admin-kit/components/ui/alert-dialog/index.js';
	import { Badge } from '@nahu/admin-kit/components/ui/badge/index.js';
	import { Input } from '@nahu/admin-kit/components/ui/input/index.js';
	import { Button, buttonVariants } from '@nahu/admin-kit/components/ui/button/index.js';
	import DialogComp from '@nahu/admin-kit/formComponents/DialogComp.svelte';
	import LoadingBtn from '@nahu/admin-kit/formComponents/LoadingBtn.svelte';
	import Errors from '@nahu/admin-kit/formComponents/Errors.svelte';
	import { createForm } from '@nahu/admin-kit/forms/createForm';
	import { formatETB, formatEthiopianDate } from '@nahu/admin-kit/global';
	import { ethiopianDateTime } from '@nahu/admin-kit/tableCells';
	import { ADJUSTMENT_REASONS, DOCUMENT_LABELS, DOCUMENT_STATUS_LABELS } from '$lib/format';
	import { LANDED_COST_KINDS } from '$lib/constants';
	import { documentHeader, lineAdd, lineEdit } from '$lib/schemas/stock';
	import DocumentHeaderFields from '../DocumentHeaderFields.svelte';
	import PaymentCard from './PaymentCard.svelte';
	import { movementColumns } from './columns';

	let { data } = $props();

	const doc = $derived(data.doc);
	const isDraft = $derived(doc.status === 'draft');
	const isReturnDoc = $derived(doc.type === 'sales_return' || doc.type === 'purchase_return');
	const type = $derived(doc.type);

	let editOpen = $state(false);
	let posting = $state(false);

	// svelte-ignore state_referenced_locally
	const header = createForm(data.headerForm, documentHeader, {
		resetForm: false,
		onUpdated({ form }) {
			if (form.message?.type === 'success') editOpen = false;
		}
	});
	const headerData = header.form;
	const headerErrors = header.errors;
	const headerAllErrors = header.allErrors;
	const headerDelayed = header.delayed;

	/** The refusal from the last Post, shown until the lines change. */
	const stockError = $derived((page.form as { stockError?: string } | null)?.stockError ?? null);

	const item: LookupField = {
		name: 'itemId',
		label: m.common_item(),
		type: 'reference',
		options: 'items',
		display: 'item'
	};
	const quantity = $derived<LookupField>({
		name: 'quantity',
		label: type === 'adjustment' ? m.stock_line_qty_adjust() : m.common_quantity(),
		type: 'number'
	});
	const unit: LookupField = {
		name: 'uomId',
		label: m.common_unit(),
		type: 'reference',
		options: 'units',
		display: 'unit',
		picker: 'select',
		required: false
	};
	const unitCost = $derived<LookupField>({
		name: 'unitCost',
		label: doc.currency ? m.stock_line_unit_cost_birr() : m.stock_line_unit_cost(),
		type: 'money',
		required: false,
		placeholder: doc.currency
			? m.stock_line_unit_cost_placeholder({ currency: doc.currency })
			: undefined
	});
	/** Receipts bought in another currency: the price as invoiced. */
	const foreignUnitCost = $derived<LookupField>({
		name: 'foreignUnitCost',
		label: m.stock_line_foreign_price({ currency: doc.currency ?? '' }),
		type: 'number',
		required: false
	});
	/** After posting: each line's share of freight, duty and the rest. */
	const landedShare: LookupField = {
		name: 'landedCost',
		label: m.stock_landed_cost(),
		type: 'money',
		required: false,
		inForm: false
	};
	const lotNumber: LookupField = {
		name: 'lotNumber',
		label: m.stock_line_lot_number(),
		type: 'text',
		required: false,
		placeholder: m.stock_line_lot_placeholder()
	};
	const expiryDate: LookupField = {
		name: 'expiryDate',
		label: m.stock_col_expiry(),
		type: 'date',
		required: false
	};
	const lotPick: LookupField = {
		name: 'lotId',
		label: m.stock_line_from_lot(),
		type: 'reference',
		options: 'lots',
		display: 'lot',
		required: false
	};
	const unitPrice: LookupField = {
		name: 'unitPrice',
		label: m.stock_line_sale_price(),
		type: 'money',
		required: false,
		placeholder: m.stock_line_sale_price_placeholder()
	};
	const sells = $derived(Boolean(data.organization?.sellsToCustomers));
	const serials: LookupField = {
		name: 'serials',
		label: m.stock_line_serials(),
		type: 'textarea',
		rows: 3,
		required: false,
		inTable: false
	};

	const lineFields = $derived<LookupField[]>(
		type === 'receipt'
			? [
					item,
					quantity,
					unit,
					...(doc.currency ? [foreignUnitCost] : []),
					unitCost,
					...(data.landed?.rows.length && !isDraft ? [landedShare] : []),
					lotNumber,
					expiryDate,
					serials
				]
			: type === 'adjustment'
				? [item, quantity, unit, lotPick, lotNumber, expiryDate, unitCost, serials]
				: type === 'issue' && sells
					? [item, quantity, unit, unitPrice, lotPick, serials]
					: [item, quantity, unit, lotPick, serials]
	);

	const lineOptions = $derived({ itemId: data.items, uomId: data.units, lotId: data.lots });

	const KIND_NAMES: Record<(typeof LANDED_COST_KINDS)[number], string> = {
		freight: m.stock_lc_freight(),
		insurance: m.stock_lc_insurance(),
		duty: m.stock_lc_duty(),
		excise: m.stock_lc_excise(),
		surtax: m.stock_lc_surtax(),
		clearing: m.stock_lc_clearing(),
		transport: m.stock_lc_transport(),
		other: m.stock_lc_other()
	};
	const costFields: LookupField[] = [
		{
			name: 'kind',
			label: m.stock_lc_cost(),
			type: 'select',
			choices: LANDED_COST_KINDS.map((k) => ({ value: k, name: KIND_NAMES[k] }))
		},
		{ name: 'description', label: m.stock_lc_description(), type: 'text', required: false },
		{ name: 'amount', label: m.stock_lc_amount(), type: 'money' },
		{
			name: 'method',
			label: m.stock_lc_shared_by(),
			type: 'select',
			choices: [
				{ value: 'value', name: m.stock_lc_by_value() },
				{ value: 'quantity', name: m.common_quantity() },
				{ value: 'weight', name: m.stock_lc_by_weight() }
			]
		},
		{
			name: 'supplierId',
			label: m.stock_lc_billed_by(),
			type: 'reference',
			options: 'suppliers',
			display: 'supplier',
			required: false
		}
	];

	/** Transfers: how many of each line arrived, as typed on the receive sheet. */
	const arrived = $state<Record<number, number>>({});

	const details = $derived(
		[
			{ name: m.common_date(), value: formatEthiopianDate(new Date(doc.docDate)) },
			{ name: m.common_branch(), value: data.names.branch },
			doc.fromLocationId && {
				name: type === 'adjustment' ? m.common_location() : m.stock_col_from(),
				value: data.names.from
			},
			doc.toLocationId && {
				name: type === 'receipt' ? m.stock_received_into() : m.stock_col_to(),
				value: data.names.to
			},
			data.names.supplier && {
				name: m.stock_supplier(),
				value: `${data.names.supplier}${data.names.supplierPhone ? ` · ${data.names.supplierPhone}` : ''}`,
				href: resolve('/dashboard/suppliers/[id]', { id: String(doc.supplierId) })
			},
			doc.purchaseOrderId && {
				name: m.stock_against_order(),
				value: data.names.purchaseOrder ?? m.stock_draft_number({ id: doc.purchaseOrderId }),
				href: resolve('/dashboard/purchasing/[id]', { id: String(doc.purchaseOrderId) })
			},
			data.names.customer && {
				name: m.stock_customer(),
				value: `${data.names.customer}${data.names.customerPhone ? ` · ${data.names.customerPhone}` : ''}`,
				href: resolve('/dashboard/customers/[id]', { id: String(doc.customerId) })
			},
			data.original && {
				name: type === 'sales_return' ? m.stock_returns_sale() : m.stock_returns_delivery(),
				value: data.original.number ?? `#${data.original.id}`,
				href: resolve('/dashboard/stock/documents/[id]', { id: String(data.original.id) })
			},
			doc.party && {
				name: type === 'sales_return' ? m.stock_returned_by() : m.stock_issued_to(),
				value: doc.party
			},
			data.totals &&
				data.totals.gross > 0 && {
					name: m.stock_col_value(),
					value:
						(data.totals.vat || data.totals.tot
							? `${formatETB(data.totals.net)}${data.totals.vat ? ` + VAT ${formatETB(data.totals.vat)}` : ''}${data.totals.tot ? ` + TOT ${formatETB(data.totals.tot)}` : ''} = ${formatETB(data.totals.gross)}`
							: formatETB(data.totals.gross)) +
						(isDraft && (type === 'issue' || type === 'receipt') ? ` ${m.stock_vat_fixed()}` : '') +
						(data.unpriced ? ` · ${m.stock_lines_unpriced({ count: data.unpriced })}` : '')
				},
			doc.currency && {
				name: m.stock_currency(),
				value: m.stock_currency_at({ currency: doc.currency, rate: String(doc.exchangeRate) })
			},
			data.landed &&
				data.landed.total > 0 && {
					name: m.stock_landed_costs(),
					value: m.stock_landed_total({ amount: formatETB(data.landed.total) })
				},
			(doc.driverName || doc.vehiclePlate) && {
				name: m.stock_carried_by(),
				value: [doc.driverName, doc.vehiclePlate].filter(Boolean).join(' · ')
			},
			doc.receivedAt && {
				name: m.stock_received(),
				value: m.stock_at_by({
					when: ethiopianDateTime(doc.receivedAt),
					who: data.names.receivedBy ?? '—'
				})
			},
			doc.reference && { name: m.common_reference(), value: doc.reference },
			doc.reason && {
				name: m.stock_reason(),
				value: ADJUSTMENT_REASONS.find((r) => r.value === doc.reason)?.name ?? doc.reason
			},
			doc.note && { name: m.common_note(), value: doc.note },
			{ name: m.stock_prepared_by(), value: data.names.createdBy ?? '—' },
			doc.postedAt && {
				name:
					doc.status === 'in_transit' || doc.receivedAt ? m.stock_dispatched() : m.stock_posted(),
				value: m.stock_at_by({
					when: ethiopianDateTime(doc.postedAt),
					who: data.names.postedBy ?? '—'
				})
			}
		].filter(Boolean) as { name: string; value: string | null; href?: string }[]
	);
</script>

<svelte:head>
	<title>{doc.number ?? m.stock_draft_title({ type: DOCUMENT_LABELS[type].toLowerCase() })}</title>
</svelte:head>

<div class="flex flex-col gap-6">
	<div class="flex flex-wrap items-start justify-between gap-4">
		<div class="flex flex-col gap-1">
			<p class="text-sm text-muted-foreground">{DOCUMENT_LABELS[type]}</p>
			<h1 class="flex items-center gap-2 text-2xl font-semibold">
				{doc.number ?? m.stock_draft_number({ id: doc.id })}
				<Badge
					variant={doc.status === 'posted'
						? 'default'
						: doc.status === 'cancelled'
							? 'destructive'
							: 'secondary'}
				>
					{DOCUMENT_STATUS_LABELS[doc.status]}
				</Badge>
			</h1>
		</div>

		<div class="flex flex-wrap gap-2">
			{#if isDraft && data.canDraft}
				<DialogComp
					bind:open={editOpen}
					title={m.stock_edit_document()}
					variant="outline"
					IconComp={Pencil}
				>
					<form
						method="POST"
						action="?/editHeader"
						use:header.enhance
						id="header"
						class="flex flex-col gap-4"
					>
						<Errors allErrors={$headerAllErrors} />
						<DocumentHeaderFields
							form={headerData}
							errors={headerErrors}
							locations={data.locations}
							destinations={data.destinations ?? undefined}
							suppliers={data.suppliers}
							supplierForm={data.supplierForm}
							customers={data.customers}
							customerForm={data.customerForm}
							lockType
						/>
						<Button type="submit" form="header">
							{#if $headerDelayed}<LoadingBtn
									name={m.common_saving()}
								/>{:else}{m.common_save()}{/if}
						</Button>
					</form>
				</DialogComp>
			{/if}

			{#if isDraft && data.canPost && !data.approval?.pending}
				<form method="POST" action="?/cancel" use:enhance>
					<Button type="submit" variant="outline"><X /> {m.stock_cancel_draft()}</Button>
				</form>

				<AlertDialog.Root>
					<AlertDialog.Trigger
						class={buttonVariants({ variant: 'default' })}
						disabled={!data.lines.rows.length}
					>
						<Check />
						{m.stock_post()}
					</AlertDialog.Trigger>
					<AlertDialog.Content>
						<AlertDialog.Header>
							<AlertDialog.Title
								>{m.stock_post_confirm_title({
									type: DOCUMENT_LABELS[type].toLowerCase()
								})}</AlertDialog.Title
							>
							<AlertDialog.Description>
								{m.stock_post_confirm_body()}
							</AlertDialog.Description>
						</AlertDialog.Header>
						<AlertDialog.Footer>
							<AlertDialog.Cancel>{m.stock_not_yet()}</AlertDialog.Cancel>
							<form
								method="POST"
								action="?/post"
								use:enhance={() => {
									posting = true;
									return async ({ update }) => {
										await update();
										posting = false;
									};
								}}
							>
								<AlertDialog.Action type="submit" disabled={posting}>
									{#if posting}<LoadingBtn name={m.stock_posting()} />{:else}{m.stock_post()}{/if}
								</AlertDialog.Action>
							</form>
						</AlertDialog.Footer>
					</AlertDialog.Content>
				</AlertDialog.Root>
			{/if}

			{#if data.canReturn && data.canDraft}
				<form method="POST" action="?/startReturn" use:enhance>
					<Button type="submit" variant="outline">
						<Undo2 />
						{type === 'issue' ? m.common_doc_sales_return() : m.common_doc_purchase_return()}
					</Button>
				</form>
			{/if}

			{#if doc.status === 'posted' || doc.status === 'in_transit'}
				<Button href="/dashboard/stock/documents/{doc.id}/print" target="_blank" variant="outline">
					<Printer />
					{doc.status === 'in_transit' ? m.stock_print_dispatch_note() : m.common_print()}
				</Button>
			{/if}
		</div>
	</div>

	{#if isDraft && data.credit}
		{@const c = data.credit}
		{@const after = Math.round((c.balance + (data.saleValue ?? 0)) * 100) / 100}
		<div
			class="flex flex-col gap-1 rounded-md border p-3 text-sm {c.creditLimit !== null &&
			after > c.creditLimit
				? 'border-destructive/50 bg-destructive/10'
				: c.overdue > 0
					? 'border-amber-500/40 bg-amber-500/10'
					: ''}"
		>
			<p>
				<strong>{data.names.customer}</strong>
				{m.stock_credit_owes({ balance: formatETB(c.balance) })}{c.overdue > 0
					? m.stock_credit_overdue_part({ overdue: formatETB(c.overdue) })
					: ''}. {m.stock_credit_takes_to()}
				<strong>{formatETB(after)}</strong>{m.stock_credit_takes_to_after()}
			</p>
			<p class="text-muted-foreground">
				{#if c.creditLimit === null}
					{m.stock_credit_no_limit()}
				{:else if c.creditLimit === 0}
					{m.stock_credit_cash_only()}
				{:else}
					{m.stock_credit_limit({ limit: formatETB(c.creditLimit) })}{after > c.creditLimit
						? m.stock_credit_over()
						: m.stock_credit_remain({ amount: formatETB(c.creditLimit - after) })}
				{/if}
			</p>
		</div>
	{/if}

	{#if data.approval?.pending}
		{@const p = data.approval.pending}
		<div
			class="flex flex-wrap items-start justify-between gap-3 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm"
		>
			<p class="flex items-start gap-2">
				<ShieldCheck class="mt-0.5 size-4 shrink-0" />
				<span>
					<strong>{m.stock_waiting_approval()}</strong> — {m.stock_approval_asked_by({
						who: p.requestedBy ?? m.stock_someone()
					})}
					{ethiopianDateTime(p.requestedAt)}: {p.reason}. {m.stock_approval_posted_when()}
					<a class="underline" href={resolve('/dashboard/approvals')}>{m.nav_approvals()}</a>
					{m.stock_approval_page_suffix()}
				</span>
			</p>
			{#if data.canDraft}
				<form method="POST" action="?/withdraw" use:enhance>
					<Button type="submit" size="sm" variant="outline">{m.stock_withdraw_to_change()}</Button>
				</form>
			{/if}
		</div>
	{:else if data.approval?.last?.status === 'rejected'}
		{@const l = data.approval.last}
		<div class="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm">
			<strong>{m.stock_not_approved()}</strong>
			{m.stock_not_approved_by({ who: l.decidedBy ?? m.stock_someone() })}{l.decisionNote
				? `: ${l.decisionNote}`
				: ''}. {m.stock_change_and_post_again()}
		</div>
	{/if}

	{#if data.transit}
		{@const t = data.transit}
		<Card.Root>
			<Card.Header>
				<Card.Title class="flex items-center gap-2">
					<Truck class="size-5" />
					{doc.status === 'in_transit' ? m.stock_on_the_way() : m.stock_what_arrived()}
				</Card.Title>
				<Card.Description>
					{#if doc.status === 'in_transit'}
						{m.stock_transit_sent_to({ to: data.names.to ?? '' })}
					{:else}
						{m.stock_transit_received_body()}
					{/if}
				</Card.Description>
			</Card.Header>
			<Card.Content>
				<form
					method="POST"
					action="?/receive"
					use:enhance={() =>
						async ({ update }) =>
							update({ reset: false })}
					class="flex flex-col gap-3"
				>
					<div class="overflow-x-auto rounded-md border">
						<table class="w-full text-sm">
							<thead class="bg-muted/50 text-left">
								<tr>
									<th class="px-3 py-2">{m.common_item()}</th>
									<th class="px-3 py-2 text-right">{m.stock_sent()}</th>
									<th class="px-3 py-2 text-right">{m.stock_arrived()}</th>
									<th class="px-3 py-2 text-right">{m.stock_missing()}</th>
								</tr>
							</thead>
							<tbody>
								{#each t.lines as l (l.id)}
									{@const got = t.canReceive ? (arrived[l.id] ?? l.sent) : (l.received ?? l.sent)}
									<tr class="border-t align-top">
										<td class="px-3 py-2">{l.item}</td>
										<td class="px-3 py-2 text-right">{l.sent} {l.unit}</td>
										<td class="px-3 py-2 text-right">
											{#if t.canReceive && l.trackSerials}
												<textarea
													name="serials_{l.id}"
													rows={Math.min(6, (l.serials ?? '').split('\n').length)}
													aria-label={m.stock_serials_arrived_aria({ item: l.item })}
													class="w-48 rounded-md border bg-background px-2 py-1 font-mono text-xs"
													>{l.serials}</textarea
												>
											{:else if t.canReceive}
												<input
													name="qty_{l.id}"
													type="number"
													min="0"
													max={l.sent}
													step="any"
													value={l.sent}
													oninput={(e) => (arrived[l.id] = Number(e.currentTarget.value))}
													aria-label={m.stock_qty_arrived_aria({ item: l.item })}
													class="h-9 w-24 rounded-md border bg-background px-2 text-right"
												/>
												<span class="ml-1 text-xs text-muted-foreground">{l.unit}</span>
											{:else}
												{l.received ?? '—'}
												{l.unit}
												{#if l.trackSerials && l.receivedSerials}
													<div class="font-mono text-xs text-muted-foreground">
														{l.receivedSerials.split('\n').join(', ')}
													</div>
												{/if}
											{/if}
										</td>
										<td
											class="px-3 py-2 text-right {l.sent - got > 0 && !l.trackSerials
												? 'text-destructive'
												: ''}"
										>
											{l.trackSerials
												? ''
												: `${Math.round((l.sent - got) * 10000) / 10000} ${l.unit}`}
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
					{#if t.canReceive}
						<Input name="note" placeholder={m.stock_delivery_note_placeholder()} class="max-w-xl" />
						<Button type="submit" class="self-start"><Check /> {m.stock_receive()}</Button>
					{/if}
				</form>
			</Card.Content>
		</Card.Root>
	{/if}

	{#if stockError && isDraft}
		<div
			class="flex items-start gap-2 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm"
		>
			<CircleAlert class="mt-0.5 size-4 shrink-0 text-destructive" />
			<p><strong>{m.stock_not_posted()}</strong> {stockError} {m.stock_nothing_changed()}</p>
		</div>
	{/if}

	<div class="grid gap-6 lg:grid-cols-2">
		<Card.Root>
			<Card.Content><SingleTable singleTable={details} /></Card.Content>
		</Card.Root>
		<PaymentCard pay={data.pay} canManage={data.pay.canManage} />
	</div>

	{#if data.fiscal}
		{@const f = data.fiscal}
		<Card.Root>
			<Card.Header>
				<Card.Title>{m.stock_fiscal_title()}</Card.Title>
			</Card.Header>
			<Card.Content class="grid gap-6 md:grid-cols-2">
				<div class="flex flex-col gap-2 text-sm">
					<p class="font-medium">
						{m.stock_fiscal_receipt()}
						{#if f.fsNumber}
							<Badge
								>{f.fiscalStatus === 'manual'
									? m.stock_fiscal_entered()
									: m.stock_fiscal_printed()}</Badge
							>
						{:else if f.fiscalStatus === 'failed'}
							<Badge variant="destructive">{m.stock_fiscal_failed()}</Badge>
						{:else if f.fiscalStatus === 'pending'}
							<Badge variant="secondary">{m.stock_fiscal_waiting()}</Badge>
						{/if}
					</p>
					{#if f.fsNumber}
						<p>
							FS No. <strong>{f.fsNumber}</strong>{f.machineCode ? ` · MRC ${f.machineCode}` : ''}
						</p>
					{:else}
						{#if f.fiscalError}<p class="text-destructive">{f.fiscalError}</p>{/if}
						{#if !f.device}
							<p class="text-muted-foreground">
								{m.stock_fiscal_no_device()}
							</p>
						{/if}
						{#if data.canPost}
							<div class="flex flex-wrap gap-2">
								{#if f.device && f.device.kind !== 'manual'}
									<form method="POST" action="?/printFiscal" use:enhance>
										<Button type="submit" size="sm"
											><Printer />
											{f.fiscalStatus === 'failed'
												? m.stock_fiscal_try_again()
												: m.stock_fiscal_print_on()}
											{f.device.name}</Button
										>
									</form>
								{/if}
								<form
									method="POST"
									action="?/recordFiscal"
									use:enhance
									class="flex flex-wrap gap-2"
								>
									<Input name="fsNumber" placeholder="FS No." class="h-9 w-32" required />
									<Input
										name="machineCode"
										placeholder="MRC"
										value={f.device?.machineCode ?? ''}
										class="h-9 w-36"
									/>
									<Button type="submit" size="sm" variant="outline"
										>{m.stock_fiscal_record()}</Button
									>
								</form>
							</div>
						{/if}
					{/if}
				</div>

				<div class="flex flex-col gap-2 text-sm">
					<p class="font-medium">
						{m.stock_einvoice()}
						{#if f.einvoiceStatus === 'accepted'}
							<Badge>{m.stock_einvoice_accepted()}</Badge>
						{:else if f.einvoiceStatus}
							<Badge variant="destructive"
								>{f.einvoiceStatus === 'submitted'
									? m.stock_einvoice_st_submitted()
									: f.einvoiceStatus === 'rejected'
										? m.stock_einvoice_st_rejected()
										: f.einvoiceStatus === 'cancelled'
											? m.stock_einvoice_st_cancelled()
											: m.stock_einvoice_st_failed()}</Badge
							>
						{/if}
						{#if f.einvoiceMode === 'sandbox'}<Badge variant="outline"
								>{m.stock_einvoice_sandbox()}</Badge
							>{/if}
					</p>
					{#if f.irn}
						<div class="flex items-start gap-3">
							{#if f.qr}<img
									src={f.qr}
									alt={m.stock_einvoice_qr_alt()}
									class="size-28 rounded border"
								/>{/if}
							<p class="break-all">IRN <strong>{f.irn}</strong></p>
						</div>
					{:else}
						{#if f.einvoiceError}<p class="text-destructive">{f.einvoiceError}</p>{/if}
						{#if !f.einvoiceMode}
							<p class="text-muted-foreground">{m.stock_einvoice_off()}</p>
						{:else if data.canPost}
							<form method="POST" action="?/submitEinvoice" use:enhance>
								<Button type="submit" size="sm" variant="outline"
									>{f.einvoiceStatus
										? m.stock_einvoice_send_again()
										: m.stock_einvoice_send()}</Button
								>
							</form>
						{/if}
					{/if}
				</div>
			</Card.Content>
		</Card.Root>
	{/if}

	<section class="flex flex-col gap-2">
		<h2 class="text-xl font-semibold">{m.stock_lines()}</h2>
		{#if isDraft && type !== 'receipt'}
			<p class="text-sm text-muted-foreground">
				{type === 'transfer' ? m.stock_lines_fefo_hint_transfer() : m.stock_lines_fefo_hint()}
			</p>
		{/if}
		{#if isReturnDoc}
			<p class="text-sm text-muted-foreground">
				{type === 'sales_return' ? m.stock_return_hint_sale() : m.stock_return_hint_purchase()}
			</p>
			<form
				method="POST"
				action="?/saveReturn"
				use:enhance={() =>
					async ({ update }) =>
						update({ reset: false })}
				class="flex flex-col gap-3"
			>
				<div class="overflow-x-auto rounded-md border">
					<table class="w-full text-sm">
						<thead class="bg-muted/50 text-left">
							<tr>
								<th class="px-3 py-2">{m.common_item()}</th>
								<th class="px-3 py-2">{m.stock_col_lot()}</th>
								<th class="px-3 py-2 text-right">{m.stock_returning()}</th>
								<th class="px-3 py-2 text-right">{m.stock_still_returnable()}</th>
								<th class="px-3 py-2 text-right"
									>{type === 'sales_return' ? m.common_price() : m.stock_cost()}</th
								>
								<th class="px-3 py-2 text-right">{m.stock_col_value()}</th>
							</tr>
						</thead>
						<tbody>
							{#each data.returnSheet as r (r.id)}
								<tr class="border-t align-top">
									<td class="px-3 py-2">{r.item}</td>
									<td class="px-3 py-2">{r.lot || '—'}</td>
									<td class="px-3 py-2 text-right">
										{#if isDraft && data.canDraft}
											{#if r.serials}
												<textarea
													name="serials_{r.id}"
													rows={Math.min(6, r.serials.split('\n').length)}
													aria-label={m.stock_serials_back_aria({ item: r.item })}
													class="w-48 rounded-md border bg-background px-2 py-1 font-mono text-xs"
													>{r.serials}</textarea
												>
											{:else}
												<input
													name="qty_{r.id}"
													type="number"
													min="0"
													max={r.left}
													step="any"
													value={r.quantity}
													aria-label={m.stock_qty_back_aria({ item: r.item })}
													class="h-9 w-24 rounded-md border bg-background px-2 text-right"
												/>
											{/if}
										{:else}
											{r.quantity}
										{/if}
										<span class="ml-1 text-xs text-muted-foreground">{r.unit}</span>
									</td>
									<td class="px-3 py-2 text-right text-muted-foreground">{r.left} {r.unit}</td>
									<td class="px-3 py-2 text-right">{r.price == null ? '—' : formatETB(r.price)}</td>
									<td class="px-3 py-2 text-right">{formatETB(r.gross)}</td>
								</tr>
							{:else}
								<tr
									><td colspan="6" class="px-3 py-6 text-center text-muted-foreground"
										>{m.stock_no_lines_left()}</td
									></tr
								>
							{/each}
						</tbody>
					</table>
				</div>
				{#if isDraft && data.canDraft && data.returnSheet.length}
					<Button type="submit" class="self-start" variant="outline"
						>{m.stock_save_quantities()}</Button
					>
				{/if}
			</form>
		{:else}
			<LookupSection
				config={{ entity: m.stock_line(), plural: m.stock_lines(), fields: lineFields }}
				rows={data.lines.rows}
				addForm={data.lines.addForm}
				editForm={data.lines.editForm}
				canDelete={isDraft && data.canDraft}
				options={lineOptions}
				actions={{ add: '?/addLine', edit: '?/editLine', delete: '?/deleteLine' }}
				schemas={{ add: lineAdd, edit: lineEdit }}
				readonly={!isDraft || !data.canDraft}
			/>
		{/if}
	</section>

	{#if data.landed && (isDraft || data.landed.rows.length)}
		<section class="flex flex-col gap-2">
			<h2 class="text-xl font-semibold">{m.stock_landed_costs()}</h2>
			<p class="text-sm text-muted-foreground">
				{m.stock_landed_hint()}
			</p>
			<LookupSection
				config={{
					entity: m.stock_landed_cost(),
					plural: m.stock_landed_costs(),
					fields: costFields
				}}
				rows={data.landed.rows}
				addForm={data.landed.addForm}
				editForm={data.landed.editForm}
				canDelete={isDraft && data.canDraft}
				options={{ supplierId: data.landed.suppliers }}
				actions={{ add: '?/addCost', edit: '?/editCost', delete: '?/deleteCost' }}
				readonly={!isDraft || !data.canDraft}
			/>
		</section>
	{/if}

	{#if data.returnsMade.length}
		<section class="flex flex-col gap-2">
			<h2 class="text-xl font-semibold">{m.stock_returns()}</h2>
			<ul class="flex flex-col divide-y rounded-md border">
				{#each data.returnsMade as r (r.id)}
					<li class="flex items-center justify-between gap-2 px-3 py-2 text-sm">
						<a
							class="font-medium underline-offset-4 hover:underline"
							href={resolve('/dashboard/stock/documents/[id]', { id: String(r.id) })}
							>{r.number ?? m.stock_draft_return({ id: r.id })}</a
						>
						<Badge variant={r.status === 'posted' ? 'default' : 'secondary'}
							>{DOCUMENT_STATUS_LABELS[r.status]}</Badge
						>
					</li>
				{/each}
			</ul>
		</section>
	{/if}

	{#if data.movements.length}
		<section class="flex flex-col gap-2">
			<h2 class="text-xl font-semibold">{m.stock_what_moved()}</h2>
			<p class="text-sm text-muted-foreground">
				{m.stock_what_moved_hint()}
			</p>
			<DataTable
				data={data.movements}
				columns={movementColumns}
				fileName={m.stock_movements_file({ number: doc.number ?? '' })}
				height="auto"
			/>
		</section>
	{/if}
</div>
