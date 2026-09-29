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
	import { columns } from './columns';

	let { data } = $props();

	const KIND = {
		adjustment: 'Adjustment',
		count: 'Stock count',
		purchase_order: 'Purchase order'
	} as const;

	/** The request being worked on, so only its buttons show as busy. */
	let busy = $state<number | null>(null);
	const when = (v: Date | string) =>
		new Date(v).toLocaleString('en-GB', { timeZone: 'Africa/Addis_Ababa' });
</script>

<svelte:head>
	<title>Approvals</title>
</svelte:head>

<div class="flex flex-col gap-6">
	<div>
		<h1 class="text-2xl font-semibold">Approvals</h1>
		<p class="text-muted-foreground">
			Adjustments, write-offs, count differences and purchase orders over the limits set on the
			business profile wait here for a second person. Approving does it, in the approver's name; the
			person who asked cannot approve their own.
		</p>
	</div>

	{#if data.pending.length === 0}
		<p class="rounded-lg border p-6 text-center text-muted-foreground">Nothing is waiting.</p>
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
							Asked by {r.requestedBy ?? 'someone'} · {when(r.requestedAt)}
						</Card.Description>
					</Card.Header>
					<Card.Content class="flex flex-col gap-3">
						<p>Needs approval because {r.reason}.</p>
						<p class="text-sm">
							Worth {formatETB(r.currentValue)} now{r.currentValue !== r.value
								? ` (${formatETB(r.value)} when asked — it has changed since)`
								: ''}.
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
								<Textarea
									name="note"
									rows={2}
									placeholder="Note (required to reject: say what to put right)"
								/>
								<div class="flex gap-2">
									<Button type="submit" formaction="?/approve" disabled={busy === r.id}>
										<Check /> Approve
									</Button>
									<Button
										type="submit"
										formaction="?/reject"
										variant="destructive"
										disabled={busy === r.id}
									>
										<X /> Reject
									</Button>
								</div>
							</form>
						{:else if mine}
							<form method="POST" action="?/withdraw" use:enhance>
								<input type="hidden" name="id" value={r.id} />
								<p class="mb-2 text-sm text-muted-foreground">
									You asked for this, so someone else decides it.
								</p>
								<Button type="submit" variant="outline"><Undo2 /> Withdraw</Button>
							</form>
						{/if}
					</Card.Content>
				</Card.Root>
			{/each}
		</div>
	{/if}

	{#if data.history.length}
		<div class="flex flex-col gap-2">
			<h2 class="text-lg font-semibold">Decided</h2>
			<DataTable data={data.history} {columns} fileName="Approvals" />
		</div>
	{/if}
</div>
