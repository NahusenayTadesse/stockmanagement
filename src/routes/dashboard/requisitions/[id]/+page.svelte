<script lang="ts">
	import BigText from '@nahu/admin-kit/components/Table/bigText.svelte';
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import Ban from '@lucide/svelte/icons/ban';
	import Check from '@lucide/svelte/icons/check';
	import PackageMinus from '@lucide/svelte/icons/package-minus';
	import Pencil from '@lucide/svelte/icons/pencil';
	import Printer from '@lucide/svelte/icons/printer';
	import Send from '@lucide/svelte/icons/send';
	import X from '@lucide/svelte/icons/x';
	import LookupSection from '@nahu/admin-kit/components/lookup/LookupSection.svelte';
	import type { LookupField } from '@nahu/admin-kit/components/lookup/types';
	import * as Card from '@nahu/admin-kit/components/ui/card/index.js';
	import { renderSnippet } from '@nahu/admin-kit/components/ui/data-table/index.js';
	import DataTable from '@nahu/admin-kit/components/Table/data-table.svelte';
	import Statuses from '@nahu/admin-kit/components/Table/statuses.svelte';
	import PageHeader from '@nahu/admin-kit/components/PageHeader.svelte';
	import PageSection from '@nahu/admin-kit/components/PageSection.svelte';
	import Notice from '@nahu/admin-kit/components/Notice.svelte';
	import { Button } from '@nahu/admin-kit/components/ui/button/index.js';
	import { Input } from '@nahu/admin-kit/components/ui/input/index.js';
	import { Textarea } from '@nahu/admin-kit/components/ui/textarea/index.js';
	import DialogComp from '@nahu/admin-kit/formComponents/DialogComp.svelte';
	import LoadingBtn from '@nahu/admin-kit/formComponents/LoadingBtn.svelte';
	import Errors from '@nahu/admin-kit/formComponents/Errors.svelte';
	import { createForm } from '@nahu/admin-kit/forms/createForm';
	import { formatEthiopianDate } from '@nahu/admin-kit/global';
	import { ethiopianDate } from '@nahu/admin-kit/tableCells';
	import type { ColumnDef } from '@tanstack/table-core';
	import {
		REQUISITION_BADGE,
		REQUISITION_STATUS_LABELS,
		requisitionHeader,
		requisitionLineAdd,
		requisitionLineEdit
	} from '$lib/schemas/requisitions';
	import { qty } from '$lib/format';
	import { m } from '$lib/paraglide/messages.js';
	import RequisitionHeaderFields from '../RequisitionHeaderFields.svelte';
	import { documentColumns } from '$lib/table';

	let { data } = $props();

	const req = $derived(data.req);
	const isDraft = $derived(req.status === 'draft');
	const openIssue = $derived(data.issues.find((i) => i.status !== 'posted'));
	const canDecide = $derived(req.status === 'submitted' && data.canApprove && !data.isAsker);

	let editOpen = $state(false);
	let busy = $state(false);

	// svelte-ignore state_referenced_locally
	const header = createForm(data.headerForm, requisitionHeader, {
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

	type LineRow = (typeof data.lines.rows)[number];
	const asked: ColumnDef<LineRow> = {
		accessorKey: 'quantity',
		meta: { align: 'right' },
		header: m.purchasing_col_asked(),
		cell: ({ row }) => qty(row.original.quantity, row.original.unit)
	};
	const inStore: ColumnDef<LineRow> = {
		accessorKey: 'onHand',
		meta: { align: 'right' },
		header: m.purchasing_col_in_store(),
		cell: ({ row }) => qty(row.original.onHand, row.original.baseUnit)
	};
	const itemColumn: ColumnDef<LineRow> = {
		accessorKey: 'item',
		header: m.common_item(),
		cell: ({ row }) => renderSnippet(itemCell, row.original)
	};
	/** What was asked, what was allowed, and what the store holds. */
	const lineColumns: ColumnDef<LineRow>[] = [
		itemColumn,
		asked,
		{
			accessorKey: 'approvedQuantity',
			header: m.purchasing_col_approved(),
			cell: ({ row }) => renderSnippet(approvedCell, row.original)
		},
		inStore
	];
	/** The approver's sheet: how much of each line to allow. */
	const approveColumns: ColumnDef<LineRow>[] = [
		itemColumn,
		asked,
		inStore,
		{
			id: 'approve',
			header: m.purchasing_col_approve(),
			cell: ({ row }) => renderSnippet(approveCell, row.original)
		}
	];
	const issueColumns = documentColumns<(typeof data.issues)[number]>(
		m.purchasing_issued_heading(),
		(id) => m.purchasing_draft_issue({ id })
	);
</script>

{#snippet itemCell(line: LineRow)}
	{line.item}
	{#if line.note}<p class="text-xs text-muted-foreground"><BigText text={line.note} /></p>{/if}
{/snippet}

{#snippet approvedCell(line: LineRow)}
	<span
		class={line.approvedQuantity !== null && line.approvedQuantity < line.quantity
			? 'font-medium text-amber-600'
			: ''}
	>
		{line.approvedQuantity === null ? '—' : qty(line.approvedQuantity, line.unit)}
	</span>
{/snippet}

{#snippet approveCell(line: LineRow)}
	<div class="flex items-center gap-1">
		<Input
			type="number"
			name="qty_{line.id}"
			value={line.quantity}
			min="0"
			max={line.quantity}
			step="any"
			class="w-28 text-right"
			aria-label={m.purchasing_approve_how_much({ item: line.item })}
		/>
		<span class="text-muted-foreground">{line.unit}</span>
	</div>
{/snippet}

<div class="flex flex-col gap-6">
	<PageHeader
		eyebrow={m.purchasing_requisition()}
		title={req.number ?? m.purchasing_draft_number({ id: req.id })}
		tabTitle={req.number ?? m.purchasing_draft_requisition({ id: req.id })}
	>
		{#snippet badges()}
			<Statuses
				status={REQUISITION_BADGE[req.status]}
				label={REQUISITION_STATUS_LABELS[req.status]}
			/>
		{/snippet}
		<p class="text-muted-foreground">
			<strong>{req.department}</strong>
			{m.purchasing_req_asks({ place: `${data.details.location} (${data.details.branch})` })} ·
			{ethiopianDate(req.requestDate)}{req.neededBy
				? ` · ${m.purchasing_req_needed_by({ date: ethiopianDate(req.neededBy) })}`
				: ''}
		</p>
		{#snippet actions()}
			{#if isDraft && data.canRequest}
				<DialogComp
					bind:open={editOpen}
					title={m.purchasing_edit_requisition()}
					variant="outline"
					IconComp={Pencil}
				>
					<form
						method="POST"
						action="?/editHeader"
						use:header.enhance
						id="requisition-header"
						class="flex flex-col gap-4"
					>
						<Errors allErrors={$headerAllErrors} />
						<RequisitionHeaderFields
							form={headerData}
							errors={headerErrors}
							locations={data.locations}
							departments={data.departments}
						/>
						<Button type="submit" form="requisition-header">{m.common_save()}</Button>
					</form>
				</DialogComp>
			{/if}

			{#if req.status !== 'issued' && req.status !== 'cancelled' && req.status !== 'rejected' && (data.canRequest || data.canApprove)}
				<form method="POST" action="?/cancel" use:enhance={submit}>
					<Button type="submit" variant="outline" disabled={busy}
						><Ban /> {m.common_cancel()}</Button
					>
				</form>
			{/if}

			{#if !isDraft}
				<Button
					href={resolve('/dashboard/requisitions/[id]/print', { id: String(req.id) })}
					target="_blank"
					variant="outline"><Printer /> {m.common_print()}</Button
				>
			{/if}

			{#if isDraft && data.canRequest}
				<form method="POST" action="?/submit" use:enhance={submit}>
					<Button type="submit" disabled={busy || !data.lines.rows.length}>
						{#if busy}<LoadingBtn name={m.purchasing_submitting()} />{:else}<Send />
							{m.purchasing_submit_for_approval()}{/if}
					</Button>
				</form>
			{/if}

			{#if req.status === 'approved' && data.canIssue}
				{#if openIssue}
					<Button href={resolve('/dashboard/stock/documents/[id]', { id: String(openIssue.id) })}
						><PackageMinus /> {m.purchasing_open_issue()}</Button
					>
				{:else}
					<form method="POST" action="?/issue" use:enhance={submit}>
						<Button type="submit" disabled={busy}
							><PackageMinus /> {m.purchasing_issue_from_store()}</Button
						>
					</form>
				{/if}
			{/if}
		{/snippet}
	</PageHeader>

	{#if req.status === 'submitted' && data.isAsker}
		<Notice tone="warning">{m.purchasing_req_waiting_own()}</Notice>
	{/if}

	{#if req.decidedAt}
		<Notice tone={req.status === 'rejected' ? 'danger' : 'success'}>
			<strong
				>{req.status === 'rejected'
					? m.purchasing_rejected_word()
					: m.purchasing_approved_word()}</strong
			>
			{m.purchasing_decided_by({
				who: data.details.decidedBy ?? '—',
				date: formatEthiopianDate(new Date(req.decidedAt))
			})}
			{#if req.decisionNote}<p><BigText text={req.decisionNote} max={120} /></p>{/if}
		</Notice>
	{/if}

	{#if req.note}
		<Card.Root>
			<Card.Content class="flex flex-col gap-1 text-sm">
				<p>
					<strong>{m.purchasing_note_label()}</strong>
					<BigText text={req.note} max={120} />
				</p>
				<p class="text-muted-foreground">
					{m.purchasing_written_by({ name: data.details.createdBy ?? '—' })}{data.details
						.submittedBy
						? m.purchasing_submitted_by({ name: data.details.submittedBy })
						: ''}
				</p>
			</Card.Content>
		</Card.Root>
	{/if}

	<PageSection title={m.purchasing_what_asked()}>
		{#if isDraft}
			<LookupSection
				config={{ entity: m.purchasing_entity_line(), plural: m.purchasing_lines(), fields }}
				rows={data.lines.rows}
				addForm={data.lines.addForm}
				editForm={data.lines.editForm}
				canDelete={data.canRequest}
				{options}
				actions={{ add: '?/addLine', edit: '?/editLine', delete: '?/deleteLine' }}
				schemas={{ add: requisitionLineAdd, edit: requisitionLineEdit }}
				readonly={!data.canRequest}
			/>
		{:else if canDecide}
			<form method="POST" action="?/approve" use:enhance={submit} class="flex flex-col gap-3">
				<p class="text-sm text-muted-foreground">
					{m.purchasing_approve_hint()}
				</p>
				<DataTable variant="sheet" data={data.lines.rows} columns={approveColumns} />
				<label class="flex flex-col gap-1 text-sm">
					{m.purchasing_note_reject()}
					<Textarea name="note" rows={2} placeholder={m.purchasing_note_reject_ph()} />
				</label>
				<div class="flex flex-wrap gap-2">
					<Button type="submit" disabled={busy}>
						{#if busy}<LoadingBtn name={m.common_saving()} />{:else}<Check />
							{m.purchasing_approve()}{/if}
					</Button>
					<Button type="submit" formaction="?/reject" variant="destructive" disabled={busy}>
						<X />
						{m.purchasing_reject()}
					</Button>
				</div>
			</form>
		{:else}
			<DataTable
				variant="compact"
				data={data.lines.rows}
				columns={lineColumns}
				fileName={req.number ?? ''}
			/>
		{/if}
	</PageSection>

	{#if data.issues.length}
		<PageSection title={m.purchasing_issued_heading()}>
			<DataTable variant="compact" data={data.issues} columns={issueColumns} />
		</PageSection>
	{/if}
</div>
