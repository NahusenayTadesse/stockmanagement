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
	import type { ColumnDef } from '@tanstack/table-core';
	import LookupSection from '@nahu/admin-kit/components/lookup/LookupSection.svelte';
	import type { LookupField } from '@nahu/admin-kit/components/lookup/types';
	import * as Card from '@nahu/admin-kit/components/ui/card/index.js';
	import { Button } from '@nahu/admin-kit/components/ui/button/index.js';
	import DataTable from '@nahu/admin-kit/components/Table/data-table.svelte';
	import Statuses from '@nahu/admin-kit/components/Table/statuses.svelte';
	import PageHeader from '@nahu/admin-kit/components/PageHeader.svelte';
	import PageSection from '@nahu/admin-kit/components/PageSection.svelte';
	import ConfirmAction from '@nahu/admin-kit/components/ConfirmAction.svelte';
	import SingleTable from '@nahu/admin-kit/components/SingleTable.svelte';
	import StatCard from '$lib/components/StatCard.svelte';
	import type { Stat } from '@nahu/admin-kit/components/reports/types';
	import DialogComp from '@nahu/admin-kit/formComponents/DialogComp.svelte';
	import Errors from '@nahu/admin-kit/formComponents/Errors.svelte';
	import { createForm } from '@nahu/admin-kit/forms/createForm';
	import { formatETB } from '@nahu/admin-kit/global';
	import { ethiopianDate } from '@nahu/admin-kit/tableCells';
	import {
		orderHeader,
		orderLineAdd,
		orderLineEdit,
		PO_BADGE,
		PO_STATUS_LABELS
	} from '$lib/schemas/purchasing';
	import { qty } from '$lib/format';
	import { longText, moneyCell } from '$lib/table';
	import OrderHeaderFields from '../OrderHeaderFields.svelte';
	import { documentColumns } from '$lib/table';
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
		{ name: 'note', label: m.common_note(), type: 'text', required: false, long: true }
	];
	const options = $derived({ itemId: data.items, uomId: data.units });

	const submit = () => {
		busy = true;
		return async ({ update }: { update: () => Promise<void> }) => {
			await update();
			busy = false;
		};
	};

	const fullyReceived = $derived(
		data.lines.rows.filter((l) => l.due === 0 && l.received > 0).length
	);
	const stats = $derived<Stat[]>([
		{
			key: 'value',
			label: m.purchasing_order_value(),
			value: data.total,
			format: 'money',
			group: 'order'
		},
		{
			key: 'received',
			label: m.purchasing_lines_fully_received(),
			value: fullyReceived,
			format: 'count',
			group: 'order',
			hint: m.purchasing_of_lines({ count: data.lines.rows.length })
		}
	]);

	const details = $derived([
		{
			name: m.purchasing_supplier_contact(),
			value: data.details.supplierPhone,
			kind: 'phone' as const
		},
		{ name: m.common_email(), value: data.details.supplierEmail ?? m.purchasing_no_email() },
		...(order.reference ? [{ name: m.common_reference(), value: order.reference }] : []),
		...(order.note ? [{ name: m.common_note(), value: order.note, long: 120 }] : []),
		{ name: m.common_prepared_by(), value: data.createdBy ?? '—' }
	]);

	type LineRow = (typeof data.lines.rows)[number];
	const lineColumns: ColumnDef<LineRow>[] = [
		{ accessorKey: 'item', header: m.common_item(), footer: m.purchasing_mail_total() },
		{ accessorKey: 'note', header: m.common_note(), cell: longText() },
		{
			accessorKey: 'quantity',
			meta: { align: 'right' },
			header: m.purchasing_col_ordered_qty(),
			cell: ({ row }) => qty(row.original.quantity, row.original.unit)
		},
		{
			accessorKey: 'received',
			meta: { align: 'right' },
			header: m.purchasing_col_received(),
			cell: ({ row }) => qty(row.original.received, row.original.unit)
		},
		{
			accessorKey: 'due',
			meta: { align: 'right' },
			header: m.purchasing_col_still_due(),
			cell: ({ row }) => (row.original.due > 0 ? qty(row.original.due, row.original.unit) : '—')
		},
		{
			accessorKey: 'unitPrice',
			header: m.common_price(),
			cell: moneyCell,
			meta: { align: 'right' }
		},
		{
			accessorKey: 'value',
			meta: { align: 'right' },
			header: m.purchasing_col_amount(),
			cell: moneyCell,
			footer: () => formatETB(data.total)
		}
	];

	const receiptColumns = documentColumns<(typeof data.receipts)[number]>(
		m.purchasing_deliveries(),
		(id) => m.purchasing_draft_receipt({ id })
	);
</script>

<div class="flex flex-col gap-6">
	<PageHeader
		eyebrow={m.purchasing_po()}
		title={order.number ?? m.purchasing_draft_number({ id: order.id })}
		tabTitle={order.number ?? m.purchasing_draft_order_title({ id: order.id })}
	>
		{#snippet badges()}
			<Statuses status={PO_BADGE[order.status]} label={PO_STATUS_LABELS[order.status]} />
		{/snippet}
		<p class="text-muted-foreground">
			<a
				class="underline-offset-4 hover:underline"
				href={resolve('/dashboard/suppliers/[id]', { id: String(order.supplierId) })}
				>{data.details.supplier}</a
			>
			· {m.purchasing_po_deliver_to({ place: data.details.location })} · {m.purchasing_po_ordered_on(
				{ date: ethiopianDate(order.orderDate) }
			)}{order.expectedDate
				? ` · ${m.purchasing_po_expected_on({ date: ethiopianDate(order.expectedDate) })}`
				: ''}
		</p>
		{#snippet actions()}
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
				<ConfirmAction
					action="?/markOrdered"
					label={m.purchasing_mark_ordered()}
					title={m.purchasing_place_order_q()}
					description={m.purchasing_place_order_desc({ supplier: data.details.supplier })}
					busyLabel={m.purchasing_ordering()}
					cancelLabel={m.purchasing_not_yet()}
					icon={Send}
					disabled={!data.lines.rows.length}
				/>
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
				<ConfirmAction
					action="?/close"
					label={m.purchasing_close_order()}
					title={m.purchasing_close_order_q()}
					description={m.purchasing_close_order_desc()}
					cancelLabel={m.purchasing_keep_open()}
					icon={X}
					variant="outline"
				/>
			{/if}

			{#if isOpen && anyDue && data.canReceive}
				<form method="POST" action="?/receive" use:enhance={submit}>
					<Button type="submit" disabled={busy}
						><PackageCheck /> {m.purchasing_receive_delivery()}</Button
					>
				</form>
			{/if}
		{/snippet}
	</PageHeader>

	<ApprovalBanner approval={data.approval} />

	<div class="grid gap-4 lg:grid-cols-3">
		{#each stats as stat (stat.key)}<StatCard {stat} />{/each}
		<Card.Root>
			<Card.Content><SingleTable singleTable={details} /></Card.Content>
		</Card.Root>
	</div>

	<PageSection title={m.purchasing_lines()}>
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
			<DataTable
				variant="compact"
				data={data.lines.rows}
				columns={lineColumns}
				fileName={order.number ?? ''}
			/>
		{/if}
	</PageSection>

	{#if data.receipts.length}
		<PageSection title={m.purchasing_deliveries()}>
			<DataTable variant="compact" data={data.receipts} columns={receiptColumns} />
		</PageSection>
	{/if}
</div>
