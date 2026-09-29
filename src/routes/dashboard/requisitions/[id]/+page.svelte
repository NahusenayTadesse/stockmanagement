<script lang="ts">
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
	import { Badge } from '@nahu/admin-kit/components/ui/badge/index.js';
	import { Button } from '@nahu/admin-kit/components/ui/button/index.js';
	import { Input } from '@nahu/admin-kit/components/ui/input/index.js';
	import { Textarea } from '@nahu/admin-kit/components/ui/textarea/index.js';
	import DialogComp from '@nahu/admin-kit/formComponents/DialogComp.svelte';
	import LoadingBtn from '@nahu/admin-kit/formComponents/LoadingBtn.svelte';
	import Errors from '@nahu/admin-kit/formComponents/Errors.svelte';
	import { createForm } from '@nahu/admin-kit/forms/createForm';
	import { formatEthiopianDate } from '@nahu/admin-kit/global';
	import {
		REQUISITION_STATUS_LABELS,
		requisitionHeader,
		requisitionLineAdd,
		requisitionLineEdit
	} from '$lib/schemas/requisitions';
	import { qty } from '$lib/format';
	import RequisitionHeaderFields from '../RequisitionHeaderFields.svelte';

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
	<title>{req.number ?? `Draft requisition #${req.id}`}</title>
</svelte:head>

<div class="flex flex-col gap-6">
	<div class="flex flex-wrap items-start justify-between gap-4">
		<div class="flex flex-col gap-1">
			<p class="text-sm text-muted-foreground">Requisition</p>
			<h1 class="flex items-center gap-2 text-2xl font-semibold">
				{req.number ?? `Draft #${req.id}`}
				<Badge
					variant={req.status === 'rejected' || req.status === 'cancelled'
						? 'destructive'
						: req.status === 'approved' || req.status === 'issued'
							? 'default'
							: 'secondary'}
				>
					{REQUISITION_STATUS_LABELS[req.status]}
				</Badge>
			</h1>
			<p class="text-muted-foreground">
				<strong>{req.department}</strong> asks {data.details.location} ({data.details.branch}) ·
				{day(req.requestDate)}{req.neededBy ? ` · needed by ${day(req.neededBy)}` : ''}
			</p>
		</div>

		<div class="flex flex-wrap gap-2">
			{#if isDraft && data.canRequest}
				<DialogComp
					bind:open={editOpen}
					title="Edit requisition"
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
						<Button type="submit" form="requisition-header">Save</Button>
					</form>
				</DialogComp>
			{/if}

			{#if req.status !== 'issued' && req.status !== 'cancelled' && req.status !== 'rejected' && (data.canRequest || data.canApprove)}
				<form method="POST" action="?/cancel" use:enhance={submit}>
					<Button type="submit" variant="outline" disabled={busy}><Ban /> Cancel</Button>
				</form>
			{/if}

			{#if !isDraft}
				<Button
					href={resolve('/dashboard/requisitions/[id]/print', { id: String(req.id) })}
					target="_blank"
					variant="outline"><Printer /> Print</Button
				>
			{/if}

			{#if isDraft && data.canRequest}
				<form method="POST" action="?/submit" use:enhance={submit}>
					<Button type="submit" disabled={busy || !data.lines.rows.length}>
						{#if busy}<LoadingBtn name="Submitting" />{:else}<Send /> Submit for approval{/if}
					</Button>
				</form>
			{/if}

			{#if req.status === 'approved' && data.canIssue}
				{#if openIssue}
					<Button href={resolve('/dashboard/stock/documents/[id]', { id: String(openIssue.id) })}
						><PackageMinus /> Open the issue</Button
					>
				{:else}
					<form method="POST" action="?/issue" use:enhance={submit}>
						<Button type="submit" disabled={busy}><PackageMinus /> Issue from the store</Button>
					</form>
				{/if}
			{/if}
		</div>
	</div>

	{#if req.status === 'submitted' && data.isAsker}
		<p class="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm dark:bg-amber-950">
			Waiting for approval. You submitted it, so someone else who may approve requisitions has to
			decide.
		</p>
	{/if}

	{#if req.decidedAt}
		<Card.Root>
			<Card.Content class="flex flex-col gap-1 text-sm">
				<p>
					<strong>{req.status === 'rejected' ? 'Rejected' : 'Approved'}</strong> by {data.details
						.decidedBy ?? '—'} on {formatEthiopianDate(new Date(req.decidedAt))}
				</p>
				{#if req.decisionNote}<p class="whitespace-pre-line">{req.decisionNote}</p>{/if}
			</Card.Content>
		</Card.Root>
	{/if}

	{#if req.note}
		<Card.Root>
			<Card.Content class="flex flex-col gap-1 text-sm">
				<p class="whitespace-pre-line"><strong>Note:</strong> {req.note}</p>
				<p class="text-muted-foreground">
					Written by {data.details.createdBy ?? '—'}{data.details.submittedBy
						? ` · submitted by ${data.details.submittedBy}`
						: ''}
				</p>
			</Card.Content>
		</Card.Root>
	{/if}

	<section class="flex flex-col gap-2">
		<h2 class="text-xl font-semibold">What is asked for</h2>
		{#if isDraft}
			<LookupSection
				config={{ entity: 'Line', plural: 'Lines', fields }}
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
					Lower a quantity to approve less; 0 refuses that line. Approving holds the stock at the
					store when the business reserves stock.
				</p>
				<div class="overflow-x-auto rounded-md border">
					<table class="w-full text-sm">
						<thead class="bg-muted/50 text-left">
							<tr>
								<th class="px-3 py-2">Item</th>
								<th class="px-3 py-2 text-right">Asked</th>
								<th class="px-3 py-2 text-right">In the store now</th>
								<th class="px-3 py-2 text-right">Approve</th>
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
									<td class="px-3 py-2 text-right">{qty(line.onHand, line.baseUnit)}</td>
									<td class="px-3 py-2">
										<div class="flex items-center justify-end gap-1">
											<Input
												type="number"
												name="qty_{line.id}"
												value={line.quantity}
												min="0"
												max={line.quantity}
												step="any"
												class="w-28 text-right"
												aria-label="Approve how much {line.item}"
											/>
											<span class="text-muted-foreground">{line.unit}</span>
										</div>
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
				<label class="flex flex-col gap-1 text-sm">
					Note (needed to reject)
					<Textarea name="note" rows={2} placeholder="Why it was cut or refused" />
				</label>
				<div class="flex flex-wrap gap-2">
					<Button type="submit" disabled={busy}>
						{#if busy}<LoadingBtn name="Saving" />{:else}<Check /> Approve{/if}
					</Button>
					<Button type="submit" formaction="?/reject" variant="destructive" disabled={busy}>
						<X /> Reject
					</Button>
				</div>
			</form>
		{:else}
			<div class="overflow-x-auto rounded-md border">
				<table class="w-full text-sm">
					<thead class="bg-muted/50 text-left">
						<tr>
							<th class="px-3 py-2">Item</th>
							<th class="px-3 py-2 text-right">Asked</th>
							<th class="px-3 py-2 text-right">Approved</th>
							<th class="px-3 py-2 text-right">In the store now</th>
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
								<td
									class="px-3 py-2 text-right {line.approvedQuantity !== null &&
									line.approvedQuantity < line.quantity
										? 'font-medium text-amber-600'
										: ''}"
								>
									{line.approvedQuantity === null ? '—' : qty(line.approvedQuantity, line.unit)}
								</td>
								<td class="px-3 py-2 text-right">{qty(line.onHand, line.baseUnit)}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	</section>

	{#if data.issues.length}
		<section class="flex flex-col gap-2">
			<h2 class="text-xl font-semibold">Issued</h2>
			<ul class="flex flex-col divide-y rounded-md border">
				{#each data.issues as doc (doc.id)}
					<li class="flex items-center justify-between gap-2 px-3 py-2 text-sm">
						<a
							class="font-medium underline-offset-4 hover:underline"
							href={resolve('/dashboard/stock/documents/[id]', { id: String(doc.id) })}
							>{doc.number ?? `Draft issue #${doc.id}`}</a
						>
						<span class="text-muted-foreground">{day(doc.docDate)}</span>
						<Badge variant={doc.status === 'posted' ? 'default' : 'secondary'}>{doc.status}</Badge>
					</li>
				{/each}
			</ul>
		</section>
	{/if}
</div>
