<script lang="ts">
	import { enhance } from '$app/forms';
	import Check from '@lucide/svelte/icons/check';
	import Undo2 from '@lucide/svelte/icons/undo-2';
	import X from '@lucide/svelte/icons/x';
	import DataTable from '@nahu/admin-kit/components/Table/data-table.svelte';
	import * as Card from '@nahu/admin-kit/components/ui/card/index.js';
	import { Badge } from '@nahu/admin-kit/components/ui/badge/index.js';
	import { Button } from '@nahu/admin-kit/components/ui/button/index.js';
	import { Textarea } from '@nahu/admin-kit/components/ui/textarea/index.js';
	import { formatETB } from '@nahu/admin-kit/global';
	import SubjectLink from './SubjectLink.svelte';
	import { columns as approvalColumns } from './columns';
	import { m } from '$lib/paraglide/messages.js';

	let { data } = $props();

	const KIND = {
		adjustment: m.purchasing_kind_adjustment(),
		count: m.purchasing_kind_count(),
		purchase_order: m.purchasing_kind_purchase_order()
	} as const;
	const columns = approvalColumns();

	/** The request being worked on, so only its buttons show as busy. */
	let busy = $state<number | null>(null);
	const when = (v: Date | string) =>
		new Date(v).toLocaleString('en-GB', { timeZone: 'Africa/Addis_Ababa' });
</script>

<svelte:head>
	<title>{m.purchasing_approvals_title()}</title>
</svelte:head>

<div class="flex flex-col gap-6">
	<div>
		<h1 class="text-2xl font-semibold">{m.purchasing_approvals_title()}</h1>
		<p class="text-muted-foreground">
			{m.purchasing_approvals_intro()}
		</p>
	</div>

	{#if data.pending.length === 0}
		<p class="rounded-lg border p-6 text-center text-muted-foreground">
			{m.purchasing_nothing_waiting()}
		</p>
	{:else}
		<div class="grid gap-4 lg:grid-cols-2">
			{#each data.pending as r (r.id)}
				{@const mine = r.requestedById === data.userId}
				<Card.Root>
					<Card.Header>
						<Card.Title class="flex flex-wrap items-center gap-2">
							<SubjectLink href={r.link} label={r.subject} />
							<Badge variant="secondary">{KIND[r.kind]}</Badge>
						</Card.Title>
						<Card.Description>
							{m.purchasing_asked_by_when({
								who: r.requestedBy ?? m.purchasing_someone(),
								when: when(r.requestedAt)
							})}
						</Card.Description>
					</Card.Header>
					<Card.Content class="flex flex-col gap-3">
						<p>{m.purchasing_needs_because({ reason: r.reason })}</p>
						<p class="text-sm">
							{r.currentValue !== r.value
								? m.purchasing_worth_now_changed({
										value: formatETB(r.currentValue),
										then: formatETB(r.value)
									})
								: m.purchasing_worth_now({ value: formatETB(r.currentValue) })}
						</p>
						{#if data.canDecide && !mine}
							<form
								method="POST"
								class="flex flex-col gap-2"
								use:enhance={() => {
									busy = r.id;
									return async ({ update }) => {
										await update();
										busy = null;
									};
								}}
							>
								<input type="hidden" name="id" value={r.id} />
								<Textarea name="note" rows={2} placeholder={m.purchasing_note_reject_required()} />
								<div class="flex gap-2">
									<Button type="submit" formaction="?/approve" disabled={busy === r.id}>
										<Check />
										{m.purchasing_approve()}
									</Button>
									<Button
										type="submit"
										formaction="?/reject"
										variant="destructive"
										disabled={busy === r.id}
									>
										<X />
										{m.purchasing_reject()}
									</Button>
								</div>
							</form>
						{:else if mine}
							<form method="POST" action="?/withdraw" use:enhance>
								<input type="hidden" name="id" value={r.id} />
								<p class="mb-2 text-sm text-muted-foreground">
									{m.purchasing_you_asked()}
								</p>
								<Button type="submit" variant="outline"><Undo2 /> {m.purchasing_withdraw()}</Button>
							</form>
						{/if}
					</Card.Content>
				</Card.Root>
			{/each}
		</div>
	{/if}

	{#if data.history.length}
		<div class="flex flex-col gap-2">
			<h2 class="text-lg font-semibold">{m.purchasing_decided()}</h2>
			<DataTable data={data.history} {columns} fileName={m.purchasing_approvals_title()} />
		</div>
	{/if}
</div>
