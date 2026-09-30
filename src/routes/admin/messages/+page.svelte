<script lang="ts">
	import type { ColumnDef } from '@tanstack/table-core';
	import Check from '@lucide/svelte/icons/check';
	import PageHeader from '@nahu/admin-kit/components/PageHeader.svelte';
	import PageSection from '@nahu/admin-kit/components/PageSection.svelte';
	import Notice from '@nahu/admin-kit/components/Notice.svelte';
	import DataTable from '@nahu/admin-kit/components/Table/data-table.svelte';
	import * as Card from '@nahu/admin-kit/components/ui/card/index.js';
	import { Button } from '@nahu/admin-kit/components/ui/button/index.js';
	import FormDialog from '@nahu/admin-kit/formComponents/FormDialog.svelte';
	import InputComp from '@nahu/admin-kit/formComponents/InputComp.svelte';
	import { ethiopianDateTime } from '@nahu/admin-kit/tableCells';
	import { column, dateTimeCell, longText, stackedCell } from '$lib/table';
	import { handleMessageSchema } from '$lib/schemas/billing';
	import { telNumber } from '$lib/site';
	import type { ContactRow } from '$lib/server/billing/admin';
	import { m } from '$lib/paraglide/messages.js';

	let { data } = $props();

	/** One dialog for every message: opened from a card, seeded with which one. */
	let open = $state(false);
	let handling = $state<ContactRow | null>(null);

	const columns: ColumnDef<ContactRow>[] = [
		column<ContactRow>('createdAt', m.common_date, dateTimeCell),
		column<ContactRow>('name', m.platform_col_from, ({ row }) =>
			stackedCell(row.original.name, row.original.email, row.original.phone, row.original.company)
		),
		column<ContactRow>('subject', m.site_contact_subject, longText(40)),
		column<ContactRow>('message', m.site_contact_message, longText(60)),
		column<ContactRow>('adminNote', m.common_note, longText(40)),
		column<ContactRow>('handledBy', m.platform_col_handled_by),
		column<ContactRow>('handledAt', m.platform_col_handled_on, dateTimeCell)
	];
</script>

<div class="flex flex-col gap-6">
	<PageHeader title={m.platform_nav_messages()} description={m.platform_messages_intro()} />

	{#if data.waiting.length === 0}
		<Notice tone="success">{m.platform_messages_none()}</Notice>
	{:else}
		<div class="grid gap-4 lg:grid-cols-2">
			{#each data.waiting as row (row.id)}
				<Card.Root>
					<Card.Header>
						<Card.Title>{row.subject}</Card.Title>
						<Card.Description>
							{m.platform_message_from({
								who: row.company ? `${row.name}, ${row.company}` : row.name,
								when: ethiopianDateTime(row.createdAt)
							})}
						</Card.Description>
					</Card.Header>
					<Card.Content class="flex flex-col gap-4">
						<p class="whitespace-pre-line">{row.message}</p>
						<div class="flex flex-wrap items-center gap-2">
							<Button
								size="sm"
								variant="outline"
								href="mailto:{row.email}?subject={encodeURIComponent(`Re: ${row.subject}`)}"
							>
								{row.email}
							</Button>
							{#if row.phone}
								<Button size="sm" variant="outline" href="tel:{telNumber(row.phone)}"
									>{row.phone}</Button
								>
							{/if}
							<Button
								size="sm"
								class="ml-auto"
								onclick={() => {
									handling = row;
									open = true;
								}}
							>
								<Check />{m.platform_message_handle()}
							</Button>
						</div>
					</Card.Content>
				</Card.Root>
			{/each}
		</div>
	{/if}

	{#if data.handled.length}
		<PageSection title={m.platform_messages_handled()}>
			<DataTable
				data={data.handled}
				{columns}
				variant="list"
				fileName={m.platform_nav_messages()}
			/>
		</PageSection>
	{/if}
</div>

<FormDialog
	bind:open
	hideTrigger
	title={m.platform_message_handle()}
	description={handling?.subject}
	submitLabel={m.platform_message_handle()}
	action="?/handle"
	data={data.form}
	schema={handleMessageSchema}
	seed={{ id: handling?.id ?? 0, adminNote: '' }}
>
	{#snippet fields({ form, errors })}
		<input type="hidden" name="id" value={handling?.id ?? ''} />
		<InputComp
			{form}
			{errors}
			name="adminNote"
			type="textarea"
			rows={3}
			label={m.platform_message_note()}
			placeholder={m.platform_message_note_placeholder()}
		/>
	{/snippet}
</FormDialog>
