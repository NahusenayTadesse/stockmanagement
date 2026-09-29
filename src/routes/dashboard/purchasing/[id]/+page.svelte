<script lang="ts">
	import SmsDialog from '$lib/components/SmsDialog.svelte';
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import Ban from '@lucide/svelte/icons/ban';
	import Mail from '@lucide/svelte/icons/mail';
	import PackageCheck from '@lucide/svelte/icons/package-check';
	import Pencil from '@lucide/svelte/icons/pencil';
	import Printer from '@lucide/svelte/icons/printer';
	import Send from '@lucide/svelte/icons/send';
	import X from '@lucide/svelte/icons/x';
	import LookupSection from '@nahu/admin-kit/components/lookup/LookupSection.svelte';
	import type { LookupField } from '@nahu/admin-kit/components/lookup/types';
	import * as Card from '@nahu/admin-kit/components/ui/card/index.js';
	import * as AlertDialog from '@nahu/admin-kit/components/ui/alert-dialog/index.js';
	import { Badge } from '@nahu/admin-kit/components/ui/badge/index.js';
	import { Button, buttonVariants } from '@nahu/admin-kit/components/ui/button/index.js';
	import DialogComp from '@nahu/admin-kit/formComponents/DialogComp.svelte';
	import LoadingBtn from '@nahu/admin-kit/formComponents/LoadingBtn.svelte';
	import Errors from '@nahu/admin-kit/formComponents/Errors.svelte';
	import { createForm } from '@nahu/admin-kit/forms/createForm';
	import { formatETB, formatEthiopianDate } from '@nahu/admin-kit/global';
	import {
		orderHeader,
		orderLineAdd,
		orderLineEdit,
		PO_STATUS_LABELS
	} from '$lib/schemas/purchasing';
	import { DOCUMENT_STATUS_LABELS, qty } from '$lib/format';
	import OrderHeaderFields from '../OrderHeaderFields.svelte';
	import ApprovalBanner from '$lib/components/ApprovalBanner.svelte';
	import { m } from '$lib/paraglide/messages.js';

	let { data } = $props();

	const order = $derived(data.order);
	const isDraft = $derived(order.status === 'draft');
	const isOpen = $derived(order.status === 'ordered' || order.status === 'partially_received');
	const anyDue = $derived(data.lines.rows.some((l) => l.due > 0));

	let editOpen = $state(false);
	let busy = $state(false);

	// svelte-ignore state_referenced_locally
	const header = createForm(data.headerForm, orderHeader, {
		resetForm: false,
		onUpdated({ form }) {
			if (form.message?.type === 'success') editOpen = false;
		}
	});
	const headerData = header.form;
	const headerErrors = header.errors;
	const headerAllErrors = header.allErrors;

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
			label: m.purchasing_f_agreed_price(),
			type: 'money',
			required: false
		},
		{ name: 'note', label: m.common_note(), type: 'text', required: false }
	];
	const options = $derived({ itemId: data.items, uomId: data.units });

	const day = (d: string) => formatEthiopianDate(new Date(`${d}T12:00:00+03:00`));
	const submit = () => {
		busy = true;
		return async ({ update }: { update: () => Promise<void> }) => {
			await update();
			busy = false;
		};
	};
</script>

<svelte:head>
	<title>{order.number ?? m.purchasing_draft_order_title({ id: order.id })}</title>
</svelte:head>

<div class="flex flex-col gap-6">
	<div class="flex flex-wrap items-start justify-between gap-4">
		<div class="flex flex-col gap-1">
			<p class="text-sm text-muted-foreground">{m.purchasing_po()}</p>
			<h1 class="flex items-center gap-2 text-2xl font-semibold">
				{order.number ?? m.purchasing_draft_number({ id: order.id })}
				<Badge
					variant={order.status === 'received' || order.status === 'closed'
						? 'default'
						: order.status === 'cancelled'
							? 'destructive'
							: 'secondary'}
				>
					{PO_STATUS_LABELS[order.status]}
				</Badge>
			</h1>
			<p class="text-muted-foreground">
				<a
					class="underline-offset-4 hover:underline"
					href={resolve('/dashboard/suppliers/[id]', { id: String(order.supplierId) })}
					>{data.details.supplier}</a
				>
				· {m.purchasing_po_deliver_to({ place: data.details.location })} · {m.purchasing_po_ordered_on(
					{
						date: day(order.orderDate)
					}
				)}{order.expectedDate
					? ` · ${m.purchasing_po_expected_on({ date: day(order.expectedDate) })}`
					: ''}
			</p>
		</div>

		<div class="flex flex-wrap gap-2">
			{#if isDraft && data.canManage}
				<DialogComp
					bind:open={editOpen}
					title={m.purchasing_edit_order()}
					variant="outline"
					IconComp={Pencil}
				>
					<form
						method="POST"
						action="?/editHeader"
						use:header.enhance
						id="order-header"
						class="flex flex-col gap-4"
					>
						<Errors allErrors={$headerAllErrors} />
						<OrderHeaderFields
							form={headerData}
							errors={headerErrors}
							suppliers={data.suppliers}
							locations={data.locations}
							supplierForm={data.supplierForm}
						/>
						<Button type="submit" form="order-header">{m.common_save()}</Button>
					</form>
				</DialogComp>
			{/if}

			{#if data.canManage && (isDraft || order.status === 'ordered')}
				<form method="POST" action="?/cancel" use:enhance>
					<Button type="submit" variant="outline"><Ban /> {m.purchasing_cancel_order()}</Button>
				</form>
			{/if}

			{#if isDraft && data.canManage && !data.approval.pending}
				<AlertDialog.Root>
					<AlertDialog.Trigger
						class={buttonVariants({ variant: 'default' })}
						disabled={!data.lines.rows.length}
					>
						<Send />
						{m.purchasing_mark_ordered()}
					</AlertDialog.Trigger>
					<AlertDialog.Content>
						<AlertDialog.Header>
							<AlertDialog.Title>{m.purchasing_place_order_q()}</AlertDialog.Title>
							<AlertDialog.Description>
								{m.purchasing_place_order_desc({ supplier: data.details.supplier })}
							</AlertDialog.Description>
						</AlertDialog.Header>
						<AlertDialog.Footer>
							<AlertDialog.Cancel>{m.purchasing_not_yet()}</AlertDialog.Cancel>
							<form method="POST" action="?/markOrdered" use:enhance={submit}>
								<AlertDialog.Action type="submit" disabled={busy}>
									{#if busy}<LoadingBtn
											name={m.purchasing_ordering()}
										/>{:else}{m.purchasing_mark_ordered()}{/if}
								</AlertDialog.Action>
							</form>
						</AlertDialog.Footer>
					</AlertDialog.Content>
				</AlertDialog.Root>
			{/if}

			{#if !isDraft && order.status !== 'cancelled'}
				<Button
					href={resolve('/dashboard/purchasing/[id]/print', { id: String(order.id) })}
					target="_blank"
					variant="outline"><Printer /> {m.common_print()}</Button
				>
				{#if data.canManage && data.canText}
					<SmsDialog
						action="?/sms"
						title={m.purchasing_text_to_supplier()}
						phone={data.details.supplierPhone}
						preview={m.purchasing_sms_order_preview()}
					/>
				{/if}
				{#if data.canManage}
					<form method="POST" action="?/email" use:enhance={submit}>
						<Button
							type="submit"
							variant="outline"
							disabled={busy || !data.details.supplierEmail}
							title={data.details.supplierEmail
								? m.purchasing_send_to({ email: data.details.supplierEmail })
								: m.purchasing_supplier_no_email_short()}
						>
							<Mail />
							{m.purchasing_email_to_supplier()}
						</Button>
					</form>
				{/if}
			{/if}

			{#if isOpen && data.canManage}
				<AlertDialog.Root>
					<AlertDialog.Trigger class={buttonVariants({ variant: 'outline' })}
						><X /> {m.purchasing_close_order()}</AlertDialog.Trigger
					>
					<AlertDialog.Content>
						<AlertDialog.Header>
							<AlertDialog.Title>{m.purchasing_close_order_q()}</AlertDialog.Title>
							<AlertDialog.Description>
								{m.purchasing_close_order_desc()}
							</AlertDialog.Description>
						</AlertDialog.Header>
						<AlertDialog.Footer>
							<AlertDialog.Cancel>{m.purchasing_keep_open()}</AlertDialog.Cancel>
							<form method="POST" action="?/close" use:enhance>
								<AlertDialog.Action type="submit">{m.purchasing_close_order()}</AlertDialog.Action>
							</form>
						</AlertDialog.Footer>
					</AlertDialog.Content>
				</AlertDialog.Root>
			{/if}

			{#if isOpen && anyDue && data.canReceive}
				<form method="POST" action="?/receive" use:enhance={submit}>
					<Button type="submit" disabled={busy}
						><PackageCheck /> {m.purchasing_receive_delivery()}</Button
					>
				</form>
			{/if}
		</div>
	</div>

	<ApprovalBanner approval={data.approval} />

	<div class="grid gap-4 sm:grid-cols-3">
		<div class="rounded-lg border p-4">
			<p class="text-sm text-muted-foreground">{m.purchasing_order_value()}</p>
			<p class="text-2xl font-semibold">{formatETB(data.total)}</p>
		</div>
		<div class="rounded-lg border p-4">
			<p class="text-sm text-muted-foreground">{m.purchasing_lines_fully_received()}</p>
			<p class="text-2xl font-semibold">
				{data.lines.rows.filter((l) => l.due === 0 && l.received > 0).length} / {data.lines.rows
					.length}
			</p>
		</div>
		<div class="rounded-lg border p-4">
			<p class="text-sm text-muted-foreground">{m.purchasing_supplier_contact()}</p>
			<p class="font-medium">{data.details.supplierPhone}</p>
			<p class="text-sm text-muted-foreground">
				{data.details.supplierEmail ?? m.purchasing_no_email()}
			</p>
		</div>
	</div>

	{#if order.reference || order.note}
		<Card.Root>
			<Card.Content class="flex flex-col gap-1 text-sm">
				{#if order.reference}<p>
						<strong>{m.purchasing_reference_label()}</strong>
						{order.reference}
					</p>{/if}
				{#if order.note}<p class="whitespace-pre-line">
						<strong>{m.purchasing_note_label()}</strong>
						{order.note}
					</p>{/if}
				<p class="text-muted-foreground">
					{m.purchasing_prepared_by({ name: data.createdBy ?? '—' })}
				</p>
			</Card.Content>
		</Card.Root>
	{/if}

	<section class="flex flex-col gap-2">
		<h2 class="text-xl font-semibold">{m.purchasing_lines()}</h2>
		{#if isDraft}
			<LookupSection
				config={{ entity: m.purchasing_entity_line(), plural: m.purchasing_lines(), fields }}
				rows={data.lines.rows}
				addForm={data.lines.addForm}
				editForm={data.lines.editForm}
				canDelete={data.canManage}
				{options}
				actions={{ add: '?/addLine', edit: '?/editLine', delete: '?/deleteLine' }}
				schemas={{ add: orderLineAdd, edit: orderLineEdit }}
				readonly={!data.canManage}
			/>
		{:else}
			<div class="overflow-x-auto rounded-md border">
				<table class="w-full text-sm">
					<thead class="bg-muted/50 text-left">
						<tr>
							<th class="px-3 py-2">{m.common_item()}</th>
							<th class="px-3 py-2 text-right">{m.purchasing_col_ordered_qty()}</th>
							<th class="px-3 py-2 text-right">{m.purchasing_col_received()}</th>
							<th class="px-3 py-2 text-right">{m.purchasing_col_still_due()}</th>
							<th class="px-3 py-2 text-right">{m.common_price()}</th>
							<th class="px-3 py-2 text-right">{m.purchasing_col_amount()}</th>
						</tr>
					</thead>
					<tbody>
						{#each data.lines.rows as line (line.id)}
							<tr class="border-t">
								<td class="px-3 py-2">
									{line.item}
									{#if line.note}<p class="text-xs text-muted-foreground">{line.note}</p>{/if}
								</td>
								<td class="px-3 py-2 text-right">{qty(line.quantity, line.unit)}</td>
								<td class="px-3 py-2 text-right">{qty(line.received, line.unit)}</td>
								<td
									class="px-3 py-2 text-right font-medium {line.due > 0 && isOpen
										? 'text-amber-600'
										: ''}">{line.due > 0 ? qty(line.due, line.unit) : '—'}</td
								>
								<td class="px-3 py-2 text-right"
									>{line.unitPrice == null ? '—' : formatETB(line.unitPrice)}</td
								>
								<td class="px-3 py-2 text-right">{formatETB(line.value)}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	</section>

	{#if data.receipts.length}
		<section class="flex flex-col gap-2">
			<h2 class="text-xl font-semibold">{m.purchasing_deliveries()}</h2>
			<ul class="flex flex-col divide-y rounded-md border">
				{#each data.receipts as r (r.id)}
					<li class="flex items-center justify-between gap-2 px-3 py-2 text-sm">
						<a
							class="font-medium underline-offset-4 hover:underline"
							href={resolve('/dashboard/stock/documents/[id]', { id: String(r.id) })}
							>{r.number ?? m.purchasing_draft_receipt({ id: r.id })}</a
						>
						<span class="text-muted-foreground">{day(r.docDate)}</span>
						<Badge variant={r.status === 'posted' ? 'default' : 'secondary'}
							>{DOCUMENT_STATUS_LABELS[r.status]}</Badge
						>
					</li>
				{/each}
			</ul>
		</section>
	{/if}
</div>
