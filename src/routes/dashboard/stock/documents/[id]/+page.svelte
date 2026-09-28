<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import Check from '@lucide/svelte/icons/check';
	import Pencil from '@lucide/svelte/icons/pencil';
	import Printer from '@lucide/svelte/icons/printer';
	import X from '@lucide/svelte/icons/x';
	import CircleAlert from '@lucide/svelte/icons/circle-alert';
	import DataTable from '@nahu/admin-kit/components/Table/data-table.svelte';
	import LookupSection from '@nahu/admin-kit/components/lookup/LookupSection.svelte';
	import type { LookupField } from '@nahu/admin-kit/components/lookup/types';
	import SingleTable from '@nahu/admin-kit/components/SingleTable.svelte';
	import * as Card from '@nahu/admin-kit/components/ui/card/index.js';
	import * as AlertDialog from '@nahu/admin-kit/components/ui/alert-dialog/index.js';
	import { Badge } from '@nahu/admin-kit/components/ui/badge/index.js';
	import { Button, buttonVariants } from '@nahu/admin-kit/components/ui/button/index.js';
	import DialogComp from '@nahu/admin-kit/formComponents/DialogComp.svelte';
	import LoadingBtn from '@nahu/admin-kit/formComponents/LoadingBtn.svelte';
	import Errors from '@nahu/admin-kit/formComponents/Errors.svelte';
	import { createForm } from '@nahu/admin-kit/forms/createForm';
	import { formatEthiopianDate } from '@nahu/admin-kit/global';
	import { ethiopianDateTime } from '@nahu/admin-kit/tableCells';
	import { ADJUSTMENT_REASONS, DOCUMENT_LABELS } from '$lib/format';
	import { documentHeader, lineAdd, lineEdit } from '$lib/schemas/stock';
	import DocumentHeaderFields from '../DocumentHeaderFields.svelte';
	import PaymentCard from './PaymentCard.svelte';
	import { movementColumns } from './columns';

	let { data } = $props();

	const doc = $derived(data.doc);
	const isDraft = $derived(doc.status === 'draft');
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
	const unitCost: LookupField = {
		name: 'unitCost',
		label: 'Unit cost (per unit above)',
		type: 'money',
		required: false
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
			? [item, quantity, unit, unitCost, lotNumber, expiryDate, serials]
			: type === 'adjustment'
				? [item, quantity, unit, lotPick, lotNumber, expiryDate, unitCost, serials]
				: [item, quantity, unit, lotPick, serials]
	);

	const lineOptions = $derived({ itemId: data.items, uomId: data.units, lotId: data.lots });

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
			doc.party && { name: 'Issued to', value: doc.party },
			doc.reference && { name: 'Reference', value: doc.reference },
			doc.reason && {
				name: 'Reason',
				value: ADJUSTMENT_REASONS.find((r) => r.value === doc.reason)?.name ?? doc.reason
			},
			doc.note && { name: 'Note', value: doc.note },
			{ name: 'Prepared by', value: data.names.createdBy ?? '—' },
			doc.postedAt && {
				name: 'Posted',
				value: `${ethiopianDateTime(doc.postedAt)} by ${data.names.postedBy ?? '—'}`
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
					{doc.status}
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
							suppliers={data.suppliers}
							supplierForm={data.supplierForm}
							lockType
						/>
						<Button type="submit" form="header">
							{#if $headerDelayed}<LoadingBtn name="Saving" />{:else}Save{/if}
						</Button>
					</form>
				</DialogComp>
			{/if}

			{#if isDraft && data.canPost}
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

			{#if doc.status === 'posted'}
				<Button href="/dashboard/stock/documents/{doc.id}/print" target="_blank" variant="outline">
					<Printer /> Print
				</Button>
			{/if}
		</div>
	</div>

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

	<section class="flex flex-col gap-2">
		<h2 class="text-xl font-semibold">Lines</h2>
		{#if isDraft && type !== 'receipt'}
			<p class="text-sm text-muted-foreground">
				Leave "From lot" empty to take the lot that expires first. Expired, quarantined and recalled
				lots are never issued{type === 'transfer' ? ', except into a quarantine location' : ''}.
			</p>
		{/if}
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
	</section>

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
