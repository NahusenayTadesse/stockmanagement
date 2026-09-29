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
	import { qty } from '$lib/format';
	import OrderHeaderFields from '../OrderHeaderFields.svelte';
	import ApprovalBanner from '$lib/components/ApprovalBanner.svelte';

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
		{ name: 'unitPrice', label: 'Agreed price (per unit above)', type: 'money', required: false },
		{ name: 'note', label: 'Note', type: 'text', required: false }
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
	<title>{order.number ?? `Draft order #${order.id}`}</title>
</svelte:head>

<div class="flex flex-col gap-6">
	<div class="flex flex-wrap items-start justify-between gap-4">
		<div class="flex flex-col gap-1">
			<p class="text-sm text-muted-foreground">Purchase order</p>
			<h1 class="flex items-center gap-2 text-2xl font-semibold">
				{order.number ?? `Draft #${order.id}`}
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
				· deliver to {data.details.location} · ordered {day(order.orderDate)}{order.expectedDate
					? ` · expected ${day(order.expectedDate)}`
					: ''}
			</p>
		</div>

		<div class="flex flex-wrap gap-2">
			{#if isDraft && data.canManage}
				<DialogComp bind:open={editOpen} title="Edit order" variant="outline" IconComp={Pencil}>
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
						<Button type="submit" form="order-header">Save</Button>
					</form>
				</DialogComp>
			{/if}

			{#if data.canManage && (isDraft || order.status === 'ordered')}
				<form method="POST" action="?/cancel" use:enhance>
					<Button type="submit" variant="outline"><Ban /> Cancel order</Button>
				</form>
			{/if}

			{#if isDraft && data.canManage && !data.approval.pending}
				<AlertDialog.Root>
					<AlertDialog.Trigger
						class={buttonVariants({ variant: 'default' })}
						disabled={!data.lines.rows.length}
					>
						<Send /> Mark as ordered
					</AlertDialog.Trigger>
					<AlertDialog.Content>
						<AlertDialog.Header>
							<AlertDialog.Title>Place this order?</AlertDialog.Title>
							<AlertDialog.Description>
								It gets its number and the lines are fixed from here on. You can then print it or
								email it to {data.details.supplier}.
							</AlertDialog.Description>
						</AlertDialog.Header>
						<AlertDialog.Footer>
							<AlertDialog.Cancel>Not yet</AlertDialog.Cancel>
							<form method="POST" action="?/markOrdered" use:enhance={submit}>
								<AlertDialog.Action type="submit" disabled={busy}>
									{#if busy}<LoadingBtn name="Ordering" />{:else}Mark as ordered{/if}
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
					variant="outline"><Printer /> Print</Button
				>
				{#if data.canManage && data.canText}
					<SmsDialog
						action="?/sms"
						title="Text to supplier"
						phone={data.details.supplierPhone}
						preview="The order number, the items and quantities, where to deliver and by when."
					/>
				{/if}
				{#if data.canManage}
					<form method="POST" action="?/email" use:enhance={submit}>
						<Button
							type="submit"
							variant="outline"
							disabled={busy || !data.details.supplierEmail}
							title={data.details.supplierEmail
								? `Send to ${data.details.supplierEmail}`
								: 'The supplier has no email address'}
						>
							<Mail /> Email to supplier
						</Button>
					</form>
				{/if}
			{/if}

			{#if isOpen && data.canManage}
				<AlertDialog.Root>
					<AlertDialog.Trigger class={buttonVariants({ variant: 'outline' })}
						><X /> Close order</AlertDialog.Trigger
					>
					<AlertDialog.Content>
						<AlertDialog.Header>
							<AlertDialog.Title>Close this order?</AlertDialog.Title>
							<AlertDialog.Description>
								What was delivered stands. Anything still due is no longer expected and stops
								counting as "on order".
							</AlertDialog.Description>
						</AlertDialog.Header>
						<AlertDialog.Footer>
							<AlertDialog.Cancel>Keep open</AlertDialog.Cancel>
							<form method="POST" action="?/close" use:enhance>
								<AlertDialog.Action type="submit">Close order</AlertDialog.Action>
							</form>
						</AlertDialog.Footer>
					</AlertDialog.Content>
				</AlertDialog.Root>
			{/if}

			{#if isOpen && anyDue && data.canReceive}
				<form method="POST" action="?/receive" use:enhance={submit}>
					<Button type="submit" disabled={busy}><PackageCheck /> Receive delivery</Button>
				</form>
			{/if}
		</div>
	</div>

	<ApprovalBanner approval={data.approval} />

	<div class="grid gap-4 sm:grid-cols-3">
		<div class="rounded-lg border p-4">
			<p class="text-sm text-muted-foreground">Order value</p>
			<p class="text-2xl font-semibold">{formatETB(data.total)}</p>
		</div>
		<div class="rounded-lg border p-4">
			<p class="text-sm text-muted-foreground">Lines fully received</p>
			<p class="text-2xl font-semibold">
				{data.lines.rows.filter((l) => l.due === 0 && l.received > 0).length} / {data.lines.rows
					.length}
			</p>
		</div>
		<div class="rounded-lg border p-4">
			<p class="text-sm text-muted-foreground">Supplier contact</p>
			<p class="font-medium">{data.details.supplierPhone}</p>
			<p class="text-sm text-muted-foreground">{data.details.supplierEmail ?? 'No email'}</p>
		</div>
	</div>

	{#if order.reference || order.note}
		<Card.Root>
			<Card.Content class="flex flex-col gap-1 text-sm">
				{#if order.reference}<p><strong>Reference:</strong> {order.reference}</p>{/if}
				{#if order.note}<p class="whitespace-pre-line"><strong>Note:</strong> {order.note}</p>{/if}
				<p class="text-muted-foreground">Prepared by {data.createdBy ?? '—'}</p>
			</Card.Content>
		</Card.Root>
	{/if}

	<section class="flex flex-col gap-2">
		<h2 class="text-xl font-semibold">Lines</h2>
		{#if isDraft}
			<LookupSection
				config={{ entity: 'Line', plural: 'Lines', fields }}
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
							<th class="px-3 py-2">Item</th>
							<th class="px-3 py-2 text-right">Ordered</th>
							<th class="px-3 py-2 text-right">Received</th>
							<th class="px-3 py-2 text-right">Still due</th>
							<th class="px-3 py-2 text-right">Price</th>
							<th class="px-3 py-2 text-right">Amount</th>
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
			<h2 class="text-xl font-semibold">Deliveries</h2>
			<ul class="flex flex-col divide-y rounded-md border">
				{#each data.receipts as r (r.id)}
					<li class="flex items-center justify-between gap-2 px-3 py-2 text-sm">
						<a
							class="font-medium underline-offset-4 hover:underline"
							href={resolve('/dashboard/stock/documents/[id]', { id: String(r.id) })}
							>{r.number ?? `Draft receipt #${r.id}`}</a
						>
						<span class="text-muted-foreground">{day(r.docDate)}</span>
						<Badge variant={r.status === 'posted' ? 'default' : 'secondary'}>{r.status}</Badge>
					</li>
				{/each}
			</ul>
		</section>
	{/if}
</div>
