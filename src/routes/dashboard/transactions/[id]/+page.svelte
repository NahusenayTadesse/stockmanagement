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
	import PageHeader from '@nahu/admin-kit/components/PageHeader.svelte';
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
	import { formatETB } from '@nahu/admin-kit/global';
	import { ethiopianDateTime } from '@nahu/admin-kit/tableCells';
	import TransactionFields from '$lib/components/TransactionFields.svelte';
	import { DOCUMENT_LABELS, DOCUMENT_STATUS_LABELS, ethiopianDay, signedAmount } from '$lib/format';
	import {
		attachmentAdd,
		PURPOSE_LABELS,
		transactionEdit,
		voidSchema
	} from '$lib/schemas/transactions';
	import { m } from '$lib/paraglide/messages.js';

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
			{
				name: m.common_date(),
				value: ethiopianDay(txn.occurredOn)
			},
			{
				name: m.sales_money(),
				value: txn.direction === 'in' ? m.sales_in_received() : m.sales_out_paid()
			},
			{ name: m.sales_paid_by(), value: data.names.method ?? '—' },
			{ name: m.sales_for(), value: PURPOSE_LABELS[txn.purpose] },
			{
				name: txn.direction === 'in' ? m.sales_received_from_label() : m.sales_paid_to(),
				value: txn.party ?? '—',
				long: 60
			},
			txn.customerId && {
				name: m.sales_customer(),
				value: data.names.customer ?? '—',
				href: resolve('/dashboard/customers/[id]', { id: String(txn.customerId) })
			},
			{ name: m.sales_tx_reference(), value: txn.reference ?? '—' },
			txn.withheld > 0 && {
				name: txn.direction === 'out' ? m.sales_tax_we_withheld() : m.sales_tax_they_withheld(),
				value: `${formatETB(txn.withheld)}${txn.withholdingReceipt ? m.sales_receipt_part({ number: txn.withholdingReceipt }) : m.sales_no_receipt_yet()}`
			},
			{ name: m.sales_receipt_invoice_no(), value: txn.receiptNumber ?? '—' },
			{ name: m.common_note(), value: txn.description ?? '—', long: 120 },
			{ name: m.common_branch(), value: data.names.branch ?? m.sales_whole_business() },
			{
				name: m.sales_recorded(),
				value: m.sales_when_by({
					when: ethiopianDateTime(txn.createdAt),
					who: data.names.recordedBy ?? '—'
				})
			},
			txn.verifiedAt && {
				name: m.sales_verified(),
				value: m.sales_when_by({
					when: ethiopianDateTime(txn.verifiedAt),
					who: data.names.verifiedBy ?? '—'
				})
			},
			txn.voidReason && { name: m.sales_voided_because(), value: txn.voidReason, long: 120 }
		].filter(Boolean) as { name: string; value: string; href?: string; long?: number }[]
	);

	const isImage = (mime: string | null) => Boolean(mime?.startsWith('image/'));
	const kb = (bytes: number | null) => (bytes ? `${Math.max(1, Math.round(bytes / 1024))} KB` : '');
</script>

<div class="flex flex-col gap-6">
	<PageHeader
		title={signedAmount(txn.direction, txn.amount)}
		eyebrow={m.sales_transaction_number({ id: txn.id })}
		tabTitle={m.sales_transaction_number({ id: txn.id })}
	>
		{#snippet badges()}
			<Badge
				variant={txn.status === 'verified'
					? 'default'
					: txn.status === 'void'
						? 'destructive'
						: 'secondary'}
			>
				{txn.status === 'recorded'
					? m.sales_not_yet_verified_badge()
					: txn.status === 'void'
						? m.sales_tx_status_void()
						: m.sales_tx_status_verified()}
			</Badge>
		{/snippet}
		{#snippet actions()}
			{#if data.canManage && open}
				<DialogComp
					bind:open={editOpen}
					title={m.sales_edit_transaction()}
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
							customers={data.customers}
						/>
						<Button type="submit" form="edit">
							{#if $editDelayed}<LoadingBtn name={m.common_saving()} />{:else}{m.common_save()}{/if}
						</Button>
					</form>
				</DialogComp>
			{/if}

			{#if data.canVerify && open}
				<form method="POST" action="?/verify" use:enhance>
					<Button type="submit"><BadgeCheck /> {m.sales_verify()}</Button>
				</form>
			{:else if open && data.isRecorder}
				<p class="self-center text-sm text-muted-foreground">
					{m.sales_someone_else_verifies()}
				</p>
			{/if}

			{#if data.canManage && txn.status !== 'void'}
				<DialogComp
					bind:open={voidOpen}
					title={m.sales_void_question()}
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
							{m.sales_void_intro()}
						</p>
						<InputComp
							form={voidData}
							errors={voidErrors}
							name="reason"
							label={m.sales_why()}
							required
						/>
						<Button type="submit" form="void" variant="destructive">{m.sales_void()}</Button>
					</form>
				</DialogComp>
			{/if}
		{/snippet}
	</PageHeader>

	<div class="grid gap-6 lg:grid-cols-2">
		<Card.Root>
			<Card.Content><SingleTable singleTable={details} /></Card.Content>
		</Card.Root>

		<div class="flex flex-col gap-6">
			<Card.Root>
				<Card.Header class="flex flex-row items-center justify-between">
					<div>
						<Card.Title>{m.sales_files_title()}</Card.Title>
						<Card.Description>{m.sales_files_intro()}</Card.Description>
					</div>
					{#if data.canManage && txn.status !== 'void'}
						<DialogComp
							bind:open={fileOpen}
							title={m.sales_attach_file()}
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
									{#if $attachDelayed}<LoadingBtn
											name={m.sales_uploading()}
										/>{:else}{m.sales_attach()}{/if}
								</Button>
							</form>
						</DialogComp>
					{/if}
				</Card.Header>
				<Card.Content>
					{#if data.files.length === 0}
						<p class="text-muted-foreground">{m.sales_no_files()}</p>
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
												alt={file.originalName ?? m.sales_attachment()}
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
												<Trash class="size-3" />
												{m.sales_remove()}
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
					<Card.Title>{m.sales_documents()}</Card.Title>
					<Card.Description>{m.sales_documents_intro()}</Card.Description>
				</Card.Header>
				<Card.Content>
					{#if data.documents.length === 0}
						<p class="text-muted-foreground">{m.sales_not_linked()}</p>
					{:else}
						<ul class="divide-y">
							{#each data.documents as doc (doc.id)}
								<li class="flex justify-between py-2">
									<a
										class="hover:underline"
										href={resolve('/dashboard/stock/documents/[id]', { id: String(doc.id) })}
									>
										{doc.number ?? m.sales_draft_number({ id: doc.id })}
									</a>
									<span class="text-sm text-muted-foreground"
										>{DOCUMENT_LABELS[doc.type]} · {DOCUMENT_STATUS_LABELS[doc.status]}</span
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
