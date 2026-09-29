<script lang="ts">
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
	import { ADJUSTMENT_REASONS, DOCUMENT_LABELS } from '$lib/format';
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
		label: 'Item',
		type: 'reference',
		options: 'items',
		display: 'item'
	};
	const quantity = $derived<LookupField>({
		name: 'quantity',
		label: type === 'adjustment' ? 'Quantity (+ adds, − removes)' : 'Quantity',
		type: 'number'
	});
	const unit: LookupField = {
		name: 'uomId',
		label: 'Unit',
		type: 'reference',
		options: 'units',
		display: 'unit',
		picker: 'select',
		required: false
	};
	const unitCost = $derived<LookupField>({
		name: 'unitCost',
		label: doc.currency ? 'Unit cost in birr (per unit above)' : 'Unit cost (per unit above)',
		type: 'money',
		required: false,
		placeholder: doc.currency ? `Empty: the ${doc.currency} price × rate` : undefined
	});
	/** Receipts bought in another currency: the price as invoiced. */
	const foreignUnitCost = $derived<LookupField>({
		name: 'foreignUnitCost',
		label: `Price in ${doc.currency} (per unit above)`,
		type: 'number',
		required: false
	});
	/** After posting: each line's share of freight, duty and the rest. */
	const landedShare: LookupField = {
		name: 'landedCost',
		label: 'Landed cost',
		type: 'money',
		required: false,
		inForm: false
	};
	const lotNumber: LookupField = {
		name: 'lotNumber',
		label: 'Lot / batch no.',
		type: 'text',
		required: false,
		placeholder: 'As printed on the pack'
	};
	const expiryDate: LookupField = {
		name: 'expiryDate',
		label: 'Expiry',
		type: 'date',
		required: false
	};
	const lotPick: LookupField = {
		name: 'lotId',
		label: 'From lot',
		type: 'reference',
		options: 'lots',
		display: 'lot',
		required: false
	};
	const unitPrice: LookupField = {
		name: 'unitPrice',
		label: 'Sale price (per unit above)',
		type: 'money',
		required: false,
		placeholder: 'Empty: the item’s list price'
	};
	const sells = $derived(Boolean(data.organization?.sellsToCustomers));
	const serials: LookupField = {
		name: 'serials',
		label: 'Serial numbers (one per line)',
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
		freight: 'Freight',
		insurance: 'Insurance',
		duty: 'Customs duty',
		excise: 'Excise tax',
		surtax: 'Surtax',
		clearing: 'Clearing agent',
		transport: 'Transport',
		other: 'Other'
	};
	const costFields: LookupField[] = [
		{
			name: 'kind',
			label: 'Cost',
			type: 'select',
			choices: LANDED_COST_KINDS.map((k) => ({ value: k, name: KIND_NAMES[k] }))
		},
		{ name: 'description', label: 'Description', type: 'text', required: false },
		{ name: 'amount', label: 'Amount (birr)', type: 'money' },
		{
			name: 'method',
			label: 'Shared by',
			type: 'select',
			choices: [
				{ value: 'value', name: 'Value (quantity × cost)' },
				{ value: 'quantity', name: 'Quantity' },
				{ value: 'weight', name: 'Weight (item weights)' }
			]
		},
		{
			name: 'supplierId',
			label: 'Billed by (optional)',
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
			{ name: 'Date', value: formatEthiopianDate(new Date(doc.docDate)) },
			{ name: 'Branch', value: data.names.branch },
			doc.fromLocationId && {
				name: type === 'adjustment' ? 'Location' : 'From',
				value: data.names.from
			},
			doc.toLocationId && {
				name: type === 'receipt' ? 'Received into' : 'To',
				value: data.names.to
			},
			data.names.supplier && {
				name: 'Supplier',
				value: `${data.names.supplier}${data.names.supplierPhone ? ` · ${data.names.supplierPhone}` : ''}`,
				href: resolve('/dashboard/suppliers/[id]', { id: String(doc.supplierId) })
			},
			doc.purchaseOrderId && {
				name: 'Against order',
				value: data.names.purchaseOrder ?? `Draft #${doc.purchaseOrderId}`,
				href: resolve('/dashboard/purchasing/[id]', { id: String(doc.purchaseOrderId) })
			},
			data.names.customer && {
				name: 'Customer',
				value: `${data.names.customer}${data.names.customerPhone ? ` · ${data.names.customerPhone}` : ''}`,
				href: resolve('/dashboard/customers/[id]', { id: String(doc.customerId) })
			},
			data.original && {
				name: type === 'sales_return' ? 'Returns sale' : 'Returns delivery',
				value: data.original.number ?? `#${data.original.id}`,
				href: resolve('/dashboard/stock/documents/[id]', { id: String(data.original.id) })
			},
			doc.party && {
				name: type === 'sales_return' ? 'Returned by' : 'Issued to',
				value: doc.party
			},
			data.totals &&
				data.totals.gross > 0 && {
					name: 'Value',
					value:
						(data.totals.vat || data.totals.tot
							? `${formatETB(data.totals.net)}${data.totals.vat ? ` + VAT ${formatETB(data.totals.vat)}` : ''}${data.totals.tot ? ` + TOT ${formatETB(data.totals.tot)}` : ''} = ${formatETB(data.totals.gross)}`
							: formatETB(data.totals.gross)) +
						(isDraft && (type === 'issue' || type === 'receipt') ? ' (VAT fixed on posting)' : '') +
						(data.unpriced ? ` · ${data.unpriced} line(s) unpriced` : '')
				},
			doc.currency && {
				name: 'Currency',
				value: `${doc.currency} at ${doc.exchangeRate} birr`
			},
			data.landed &&
				data.landed.total > 0 && {
					name: 'Landed costs',
					value: `${formatETB(data.landed.total)} (freight, duty… — added to what the stock cost)`
				},
			(doc.driverName || doc.vehiclePlate) && {
				name: 'Carried by',
				value: [doc.driverName, doc.vehiclePlate].filter(Boolean).join(' · ')
			},
			doc.receivedAt && {
				name: 'Received',
				value: `${ethiopianDateTime(doc.receivedAt)} by ${data.names.receivedBy ?? '—'}`
			},
			doc.reference && { name: 'Reference', value: doc.reference },
			doc.reason && {
				name: 'Reason',
				value: ADJUSTMENT_REASONS.find((r) => r.value === doc.reason)?.name ?? doc.reason
			},
			doc.note && { name: 'Note', value: doc.note },
			{ name: 'Prepared by', value: data.names.createdBy ?? '—' },
			doc.postedAt && {
				name: 'Posted',
				value: `${ethiopianDateTime(doc.postedAt)} by ${data.names.postedBy ?? '—'}`,
				...(doc.status === 'in_transit' || doc.receivedAt ? { name: 'Dispatched' } : {})
			}
		].filter(Boolean) as { name: string; value: string | null; href?: string }[]
	);
</script>

<svelte:head>
	<title>{doc.number ?? `Draft ${DOCUMENT_LABELS[type].toLowerCase()}`}</title>
</svelte:head>

<div class="flex flex-col gap-6">
	<div class="flex flex-wrap items-start justify-between gap-4">
		<div class="flex flex-col gap-1">
			<p class="text-sm text-muted-foreground">{DOCUMENT_LABELS[type]}</p>
			<h1 class="flex items-center gap-2 text-2xl font-semibold">
				{doc.number ?? `Draft #${doc.id}`}
				<Badge
					variant={doc.status === 'posted'
						? 'default'
						: doc.status === 'cancelled'
							? 'destructive'
							: 'secondary'}
				>
					{doc.status === 'in_transit' ? 'in transit' : doc.status}
				</Badge>
			</h1>
		</div>

		<div class="flex flex-wrap gap-2">
			{#if isDraft && data.canDraft}
				<DialogComp bind:open={editOpen} title="Edit document" variant="outline" IconComp={Pencil}>
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
							{#if $headerDelayed}<LoadingBtn name="Saving" />{:else}Save{/if}
						</Button>
					</form>
				</DialogComp>
			{/if}

			{#if isDraft && data.canPost && !data.approval?.pending}
				<form method="POST" action="?/cancel" use:enhance>
					<Button type="submit" variant="outline"><X /> Cancel draft</Button>
				</form>

				<AlertDialog.Root>
					<AlertDialog.Trigger
						class={buttonVariants({ variant: 'default' })}
						disabled={!data.lines.rows.length}
					>
						<Check /> Post
					</AlertDialog.Trigger>
					<AlertDialog.Content>
						<AlertDialog.Header>
							<AlertDialog.Title>Post this {DOCUMENT_LABELS[type].toLowerCase()}?</AlertDialog.Title
							>
							<AlertDialog.Description>
								Stock changes now, and the document gets its number. A posted document cannot be
								edited; a mistake is corrected with another document.
							</AlertDialog.Description>
						</AlertDialog.Header>
						<AlertDialog.Footer>
							<AlertDialog.Cancel>Not yet</AlertDialog.Cancel>
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
									{#if posting}<LoadingBtn name="Posting" />{:else}Post{/if}
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
						{type === 'issue' ? 'Customer return' : 'Return to supplier'}
					</Button>
				</form>
			{/if}

			{#if doc.status === 'posted' || doc.status === 'in_transit'}
				<Button href="/dashboard/stock/documents/{doc.id}/print" target="_blank" variant="outline">
					<Printer />
					{doc.status === 'in_transit' ? 'Print dispatch note' : 'Print'}
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
				<strong>{data.names.customer}</strong> owes {formatETB(c.balance)} now{c.overdue > 0
					? `, ${formatETB(c.overdue)} of it overdue`
					: ''}. Unless paid, this sale takes it to <strong>{formatETB(after)}</strong>.
			</p>
			<p class="text-muted-foreground">
				{#if c.creditLimit === null}
					No credit limit set.
				{:else if c.creditLimit === 0}
					Cash only: record the payment below before posting.
				{:else}
					Credit limit {formatETB(c.creditLimit)}{after > c.creditLimit
						? ' — this sale goes over it. Record a payment first, or have someone allowed to exceed limits post it.'
						: `; ${formatETB(c.creditLimit - after)} would remain.`}
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
					<strong>Waiting for approval</strong> — asked by {p.requestedBy ?? 'someone'}
					{ethiopianDateTime(p.requestedAt)}: {p.reason}. It is posted when someone with the right
					to approve does so on the
					<a class="underline" href={resolve('/dashboard/approvals')}>Approvals</a> page.
				</span>
			</p>
			{#if data.canDraft}
				<form method="POST" action="?/withdraw" use:enhance>
					<Button type="submit" size="sm" variant="outline">Withdraw to change it</Button>
				</form>
			{/if}
		</div>
	{:else if data.approval?.last?.status === 'rejected'}
		{@const l = data.approval.last}
		<div class="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm">
			<strong>Not approved</strong> by {l.decidedBy ?? 'someone'}{l.decisionNote
				? `: ${l.decisionNote}`
				: ''}. Change it and post again, or cancel it.
		</div>
	{/if}

	{#if data.transit}
		{@const t = data.transit}
		<Card.Root>
			<Card.Header>
				<Card.Title class="flex items-center gap-2">
					<Truck class="size-5" />
					{doc.status === 'in_transit' ? 'On the way' : 'What arrived'}
				</Card.Title>
				<Card.Description>
					{#if doc.status === 'in_transit'}
						Sent to {data.names.to}. It is in transit until {data.names.to} says what arrived; anything
						that did not is written off as lost in transit.
					{:else}
						Sent and received quantities. Differences were written off as lost in transit.
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
									<th class="px-3 py-2">Item</th>
									<th class="px-3 py-2 text-right">Sent</th>
									<th class="px-3 py-2 text-right">Arrived</th>
									<th class="px-3 py-2 text-right">Missing</th>
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
													aria-label="Serials of {l.item} that arrived"
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
													aria-label="Quantity of {l.item} that arrived"
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
						<Input name="note" placeholder="Note on the delivery (optional)" class="max-w-xl" />
						<Button type="submit" class="self-start"><Check /> Receive</Button>
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
			<p><strong>Not posted.</strong> {stockError} Nothing was changed.</p>
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
				<Card.Title>Fiscal receipt & e-invoice</Card.Title>
			</Card.Header>
			<Card.Content class="grid gap-6 md:grid-cols-2">
				<div class="flex flex-col gap-2 text-sm">
					<p class="font-medium">
						Fiscal receipt
						{#if f.fsNumber}
							<Badge>{f.fiscalStatus === 'manual' ? 'entered' : 'printed'}</Badge>
						{:else if f.fiscalStatus === 'failed'}
							<Badge variant="destructive">failed</Badge>
						{:else if f.fiscalStatus === 'pending'}
							<Badge variant="secondary">waiting for the FS No.</Badge>
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
								No fiscal device is set up for this branch (Admin panel → Fiscal devices).
							</p>
						{/if}
						{#if data.canPost}
							<div class="flex flex-wrap gap-2">
								{#if f.device && f.device.kind !== 'manual'}
									<form method="POST" action="?/printFiscal" use:enhance>
										<Button type="submit" size="sm"
											><Printer />
											{f.fiscalStatus === 'failed' ? 'Try again' : 'Print on'}
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
									<Button type="submit" size="sm" variant="outline">Record</Button>
								</form>
							</div>
						{/if}
					{/if}
				</div>

				<div class="flex flex-col gap-2 text-sm">
					<p class="font-medium">
						E-invoice
						{#if f.einvoiceStatus === 'accepted'}
							<Badge>accepted</Badge>
						{:else if f.einvoiceStatus}
							<Badge variant="destructive">{f.einvoiceStatus}</Badge>
						{/if}
						{#if f.einvoiceMode === 'sandbox'}<Badge variant="outline">sandbox</Badge>{/if}
					</p>
					{#if f.irn}
						<div class="flex items-start gap-3">
							{#if f.qr}<img
									src={f.qr}
									alt="E-invoice QR code"
									class="size-28 rounded border"
								/>{/if}
							<p class="break-all">IRN <strong>{f.irn}</strong></p>
						</div>
					{:else}
						{#if f.einvoiceError}<p class="text-destructive">{f.einvoiceError}</p>{/if}
						{#if !f.einvoiceMode}
							<p class="text-muted-foreground">E-invoicing is off (Business profile).</p>
						{:else if data.canPost}
							<form method="POST" action="?/submitEinvoice" use:enhance>
								<Button type="submit" size="sm" variant="outline"
									>{f.einvoiceStatus ? 'Send again' : 'Send e-invoice'}</Button
								>
							</form>
						{/if}
					{/if}
				</div>
			</Card.Content>
		</Card.Root>
	{/if}

	<section class="flex flex-col gap-2">
		<h2 class="text-xl font-semibold">Lines</h2>
		{#if isDraft && type !== 'receipt'}
			<p class="text-sm text-muted-foreground">
				Leave "From lot" empty to take the lot that expires first. Expired, quarantined and recalled
				lots are never issued{type === 'transfer' ? ', except into a quarantine location' : ''}.
			</p>
		{/if}
		{#if isReturnDoc}
			<p class="text-sm text-muted-foreground">
				{type === 'sales_return'
					? 'Everything still returnable on the sale, back into the lot it left from. Lower each line to what the customer brought back; 0 drops it.'
					: 'Everything still returnable on the delivery, from the lot it came in as — expired and quarantined stock included. Lower each line to what is going back; 0 drops it.'}
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
								<th class="px-3 py-2">Item</th>
								<th class="px-3 py-2">Lot</th>
								<th class="px-3 py-2 text-right">Returning</th>
								<th class="px-3 py-2 text-right">Still returnable</th>
								<th class="px-3 py-2 text-right">{type === 'sales_return' ? 'Price' : 'Cost'}</th>
								<th class="px-3 py-2 text-right">Value</th>
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
													aria-label="Serials of {r.item} coming back"
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
													aria-label="Quantity of {r.item} returning"
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
										>No lines left.</td
									></tr
								>
							{/each}
						</tbody>
					</table>
				</div>
				{#if isDraft && data.canDraft && data.returnSheet.length}
					<Button type="submit" class="self-start" variant="outline">Save quantities</Button>
				{/if}
			</form>
		{:else}
			<LookupSection
				config={{ entity: 'Line', plural: 'Lines', fields: lineFields }}
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
			<h2 class="text-xl font-semibold">Landed costs</h2>
			<p class="text-sm text-muted-foreground">
				Freight, insurance, customs duty, the clearing agent… in birr. When the receipt is posted
				they are shared over its lines and added to what the stock cost. They are not owed to the
				supplier of the goods.
			</p>
			<LookupSection
				config={{ entity: 'Landed cost', plural: 'Landed costs', fields: costFields }}
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
			<h2 class="text-xl font-semibold">Returns</h2>
			<ul class="flex flex-col divide-y rounded-md border">
				{#each data.returnsMade as r (r.id)}
					<li class="flex items-center justify-between gap-2 px-3 py-2 text-sm">
						<a
							class="font-medium underline-offset-4 hover:underline"
							href={resolve('/dashboard/stock/documents/[id]', { id: String(r.id) })}
							>{r.number ?? `Draft return #${r.id}`}</a
						>
						<Badge variant={r.status === 'posted' ? 'default' : 'secondary'}>{r.status}</Badge>
					</li>
				{/each}
			</ul>
		</section>
	{/if}

	{#if data.movements.length}
		<section class="flex flex-col gap-2">
			<h2 class="text-xl font-semibold">What moved</h2>
			<p class="text-sm text-muted-foreground">
				The ledger rows this document wrote, in base units.
			</p>
			<DataTable
				data={data.movements}
				columns={movementColumns}
				fileName="{doc.number} movements"
				height="auto"
			/>
		</section>
	{/if}
</div>
