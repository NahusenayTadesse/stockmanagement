<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import Check from '@lucide/svelte/icons/check';
	import X from '@lucide/svelte/icons/x';
	import * as Card from '@nahu/admin-kit/components/ui/card/index.js';
	import { Button } from '@nahu/admin-kit/components/ui/button/index.js';
	import { Textarea } from '@nahu/admin-kit/components/ui/textarea/index.js';
	import { formatETB } from '@nahu/admin-kit/global';
	import { ethiopianDateTime } from '@nahu/admin-kit/tableCells';
	import ReceiptLink from '$lib/components/ReceiptLink.svelte';
	import { periodText } from '$lib/billing';
	import type { AdminPaymentRow } from '$lib/server/billing/admin';
	import { m } from '$lib/paraglide/messages.js';

	/**
	 * Transfer receipts waiting to be checked, one card each: who paid what, into which account,
	 * the receipt itself, and the two decisions. Rejecting needs a reason — the business reads it.
	 * Posts to the page's `?/confirm` and `?/reject`.
	 */
	let { receipts }: { receipts: AdminPaymentRow[] } = $props();

	/** The receipt being decided, so only its buttons show as busy. */
	let busy = $state<number | null>(null);
</script>

<div class="grid gap-4 lg:grid-cols-2">
	{#each receipts as r (r.id)}
		<Card.Root>
			<Card.Header>
				<Card.Title class="flex flex-wrap items-center justify-between gap-2">
					<a class="underline underline-offset-2" href={resolve(`/admin/businesses/${r.orgId}`)}
						>{r.business}</a
					>
					<span class="tabular-nums">{formatETB(r.amount)}</span>
				</Card.Title>
				<Card.Description>
					{m.platform_receipt_from({
						who: r.paidBy ?? r.business,
						when: ethiopianDateTime(r.createdAt)
					})}
				</Card.Description>
			</Card.Header>
			<Card.Content class="flex flex-col gap-3">
				<dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
					<dt class="text-muted-foreground">{m.billing_package()}</dt>
					<dd>{r.packageName} · {periodText(r.months)}</dd>
					<dt class="text-muted-foreground">{m.platform_paid_into()}</dt>
					<dd>{r.bank ?? '—'}</dd>
					<dt class="text-muted-foreground">{m.billing_transfer_reference()}</dt>
					<dd class="break-all">{r.payerReference ?? '—'}</dd>
					<dt class="text-muted-foreground">{m.billing_col_receipt()}</dt>
					<dd><ReceiptLink file={r.receiptFile} base="/admin/files" /></dd>
				</dl>
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
						aria-label={m.platform_reject_reason()}
						placeholder={m.platform_reject_reason()}
					/>
					<div class="flex gap-2">
						<Button type="submit" formaction="?/confirm" disabled={busy === r.id}>
							<Check />
							{m.platform_confirm_payment()}
						</Button>
						<Button
							type="submit"
							formaction="?/reject"
							variant="destructive"
							disabled={busy === r.id}
						>
							<X />
							{m.platform_reject_payment()}
						</Button>
					</div>
				</form>
			</Card.Content>
		</Card.Root>
	{/each}
</div>
