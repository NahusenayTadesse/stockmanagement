<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import BadgeCheck from '@lucide/svelte/icons/badge-check';
	import Ban from '@lucide/svelte/icons/ban';
	import FileText from '@lucide/svelte/icons/file-text';
	import Paperclip from '@lucide/svelte/icons/paperclip';
	import Pencil from '@lucide/svelte/icons/pencil';
	import Trash from '@lucide/svelte/icons/trash';
	import SingleTable from '@nahu/admin-kit/components/SingleTable.svelte';
	import * as Card from '@nahu/admin-kit/components/ui/card/index.js';
	import { Badge } from '@nahu/admin-kit/components/ui/badge/index.js';
	import { Button } from '@nahu/admin-kit/components/ui/button/index.js';
	import DialogComp from '@nahu/admin-kit/formComponents/DialogComp.svelte';
	import FileUpload from '@nahu/admin-kit/formComponents/FileUpload.svelte';
	import InputComp from '@nahu/admin-kit/formComponents/InputComp.svelte';
	import LoadingBtn from '@nahu/admin-kit/formComponents/LoadingBtn.svelte';
	import Errors from '@nahu/admin-kit/formComponents/Errors.svelte';
	import { createForm } from '@nahu/admin-kit/forms/createForm';
	import { fileUrl } from '@nahu/admin-kit/files';
	import { formatEthiopianDate } from '@nahu/admin-kit/global';
	import { ethiopianDateTime } from '@nahu/admin-kit/tableCells';
	import TransactionFields from '$lib/components/TransactionFields.svelte';
	import { DOCUMENT_LABELS } from '$lib/format';
	import {
		attachmentAdd,
		PURPOSE_LABELS,
		transactionEdit,
		voidSchema
	} from '$lib/schemas/transactions';
	import { signed } from '../columns';

	let { data } = $props();

	const txn = $derived(data.txn);
	const open = $derived(txn.status === 'recorded');

	let editOpen = $state(false);
	let fileOpen = $state(false);
	let voidOpen = $state(false);

	// svelte-ignore state_referenced_locally
	const edit = createForm(data.editForm, transactionEdit, {
		resetForm: false,
		onUpdated({ form }) {
			if (form.message?.type === 'success') editOpen = false;
		}
	});
	const editData = edit.form;
	const editErrors = edit.errors;
	const editAll = edit.allErrors;
	const editDelayed = edit.delayed;

	// svelte-ignore state_referenced_locally
	const attach = createForm(data.attachForm, attachmentAdd, {
		resetForm: true,
		onUpdated({ form }) {
			if (form.message?.type === 'success') fileOpen = false;
		}
	});
	const attachData = attach.form;
	const attachErrors = attach.errors;
	const attachDelayed = attach.delayed;

	// svelte-ignore state_referenced_locally
	const voiding = createForm(data.voidForm, voidSchema, {
		onUpdated({ form }) {
			if (form.message?.type === 'success') voidOpen = false;
		}
	});
	const voidData = voiding.form;
	const voidErrors = voiding.errors;

	const details = $derived(
		[
			{ name: 'Date', value: formatEthiopianDate(new Date(`${txn.occurredOn}T12:00:00+03:00`)) },
			{ name: 'Money', value: txn.direction === 'in' ? 'In — received' : 'Out — paid' },
			{ name: 'Paid by', value: data.names.method ?? '—' },
			{ name: 'For', value: PURPOSE_LABELS[txn.purpose] },
			{ name: txn.direction === 'in' ? 'Received from' : 'Paid to', value: txn.party ?? '—' },
			{ name: 'Transaction reference', value: txn.reference ?? '—' },
			{ name: 'Receipt / invoice no.', value: txn.receiptNumber ?? '—' },
			{ name: 'Note', value: txn.description ?? '—' },
			{ name: 'Branch', value: data.names.branch ?? 'Whole business' },
			{
				name: 'Recorded',
				value: `${ethiopianDateTime(txn.createdAt)} by ${data.names.recordedBy ?? '—'}`
			},
			txn.verifiedAt && {
				name: 'Verified',
				value: `${ethiopianDateTime(txn.verifiedAt)} by ${data.names.verifiedBy ?? '—'}`
			},
			txn.voidReason && { name: 'Voided because', value: txn.voidReason }
		].filter((row): row is { name: string; value: string } => Boolean(row))
	);

	const isImage = (mime: string | null) => Boolean(mime?.startsWith('image/'));
	const kb = (bytes: number | null) => (bytes ? `${Math.max(1, Math.round(bytes / 1024))} KB` : '');
</script>

<svelte:head>
	<title>Transaction #{txn.id}</title>
</svelte:head>

<div class="flex flex-col gap-6">
	<div class="flex flex-wrap items-start justify-between gap-4">
		<div class="flex flex-col gap-1">
			<p class="text-sm text-muted-foreground">Transaction #{txn.id}</p>
			<h1
				class="flex items-center gap-2 text-2xl font-semibold {txn.status === 'void'
					? 'text-muted-foreground line-through'
					: txn.direction === 'in'
						? 'text-emerald-700 dark:text-emerald-400'
						: ''}"
			>
				{signed(txn.direction, txn.amount)}
			</h1>
			<div>
				<Badge
					variant={txn.status === 'verified'
						? 'default'
						: txn.status === 'void'
							? 'destructive'
							: 'secondary'}
				>
					{txn.status === 'recorded' ? 'not yet verified' : txn.status}
				</Badge>
			</div>
		</div>

		<div class="flex flex-wrap gap-2">
			{#if data.canManage && open}
				<DialogComp
					bind:open={editOpen}
					title="Edit transaction"
					variant="outline"
					IconComp={Pencil}
				>
					<form
						method="POST"
						action="?/edit"
						use:edit.enhance
						id="edit"
						class="flex flex-col gap-4"
					>
						<Errors allErrors={$editAll} />
						<TransactionFields
							form={editData}
							errors={editErrors}
							methods={data.methods}
							branches={data.branches}
							suppliers={data.suppliers}
						/>
						<Button type="submit" form="edit">
							{#if $editDelayed}<LoadingBtn name="Saving" />{:else}Save{/if}
						</Button>
					</form>
				</DialogComp>
			{/if}

			{#if data.canVerify && open}
				<form method="POST" action="?/verify" use:enhance>
					<Button type="submit"><BadgeCheck /> Verify</Button>
				</form>
			{:else if open && data.isRecorder}
				<p class="self-center text-sm text-muted-foreground">
					Someone else verifies what you record.
				</p>
			{/if}

			{#if data.canManage && txn.status !== 'void'}
				<DialogComp
					bind:open={voidOpen}
					title="Void this transaction?"
					variant="outline"
					IconComp={Ban}
				>
					<form
						method="POST"
						action="?/void"
						use:voiding.enhance
						id="void"
						class="flex flex-col gap-4"
					>
						<p class="text-sm text-muted-foreground">
							It stays on record, struck through, and stops counting in every total.
						</p>
						<InputComp form={voidData} errors={voidErrors} name="reason" label="Why" required />
						<Button type="submit" form="void" variant="destructive">Void</Button>
					</form>
				</DialogComp>
			{/if}
		</div>
	</div>

	<div class="grid gap-6 lg:grid-cols-2">
		<Card.Root>
			<Card.Content><SingleTable singleTable={details} /></Card.Content>
		</Card.Root>

		<div class="flex flex-col gap-6">
			<Card.Root>
				<Card.Header class="flex flex-row items-center justify-between">
					<div>
						<Card.Title>Screenshots and receipts</Card.Title>
						<Card.Description
							>Transfer confirmations, receipts, cheques — images or PDF.</Card.Description
						>
					</div>
					{#if data.canManage && txn.status !== 'void'}
						<DialogComp
							bind:open={fileOpen}
							title="Attach a file"
							variant="outline"
							IconComp={Paperclip}
						>
							<form
								method="POST"
								action="?/attach"
								enctype="multipart/form-data"
								use:attach.enhance
								id="attach"
								class="flex flex-col gap-4"
							>
								<FileUpload form={attachData} name="file" />
								{#if $attachErrors.file}<span class="text-sm text-destructive"
										>{$attachErrors.file}</span
									>{/if}
								<Button type="submit" form="attach">
									{#if $attachDelayed}<LoadingBtn name="Uploading" />{:else}Attach{/if}
								</Button>
							</form>
						</DialogComp>
					{/if}
				</Card.Header>
				<Card.Content>
					{#if data.files.length === 0}
						<p class="text-muted-foreground">No files yet.</p>
					{:else}
						<div class="grid grid-cols-2 gap-3 sm:grid-cols-3">
							{#each data.files as file (file.id)}
								<div class="flex flex-col gap-1 rounded-md border p-2">
									<a
										href={resolve('/dashboard/files/[name]', { name: file.fileName })}
										target="_blank"
										rel="noopener"
										class="block"
									>
										{#if isImage(file.mimeType)}
											<img
												src={fileUrl(file.fileName)}
												alt={file.originalName ?? 'Attachment'}
												loading="lazy"
												class="h-32 w-full rounded object-cover"
											/>
										{:else}
											<div class="flex h-32 w-full items-center justify-center rounded bg-muted">
												<FileText class="size-10 text-muted-foreground" />
											</div>
										{/if}
									</a>
									<p class="truncate text-xs" title={file.originalName}>{file.originalName}</p>
									<p class="text-xs text-muted-foreground">
										{kb(file.sizeBytes)} · {file.uploadedBy ?? ''}
									</p>
									{#if data.canManage && open}
										<form method="POST" action="?/removeFile" use:enhance>
											<input type="hidden" name="fileId" value={file.id} />
											<Button
												type="submit"
												size="sm"
												variant="ghost"
												class="h-7 w-full text-destructive"
											>
												<Trash class="size-3" /> Remove
											</Button>
										</form>
									{/if}
								</div>
							{/each}
						</div>
					{/if}
				</Card.Content>
			</Card.Root>

			<Card.Root>
				<Card.Header>
					<Card.Title>Documents</Card.Title>
					<Card.Description>Stock documents this money was for.</Card.Description>
				</Card.Header>
				<Card.Content>
					{#if data.documents.length === 0}
						<p class="text-muted-foreground">Not linked to any document.</p>
					{:else}
						<ul class="divide-y">
							{#each data.documents as doc (doc.id)}
								<li class="flex justify-between py-2">
									<a
										class="hover:underline"
										href={resolve('/dashboard/stock/documents/[id]', { id: String(doc.id) })}
									>
										{doc.number ?? `Draft #${doc.id}`}
									</a>
									<span class="text-sm text-muted-foreground"
										>{DOCUMENT_LABELS[doc.type]} · {doc.status}</span
									>
								</li>
							{/each}
						</ul>
					{/if}
				</Card.Content>
			</Card.Root>
		</div>
	</div>
</div>
