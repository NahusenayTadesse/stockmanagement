<script lang="ts">
	import { resolve } from '$app/paths';
	import ShieldCheck from '@lucide/svelte/icons/shield-check';
	import ShieldX from '@lucide/svelte/icons/shield-x';
	import { formatETB } from '@nahu/admin-kit/global';
	import { m } from '$lib/paraglide/messages.js';

	/**
	 * Says a document, count or order is waiting for a second person's approval — or was rejected,
	 * and why. Shows nothing when neither.
	 */
	let {
		approval
	}: {
		approval: {
			pending: {
				id: number;
				value: number;
				reason: string;
				requestedBy: string | null;
			} | null;
			last: {
				status: string;
				decisionNote: string | null;
				decidedBy: string | null;
			} | null;
		};
	} = $props();
</script>

{#if approval.pending}
	<div
		class="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm"
	>
		<ShieldCheck class="mt-0.5 size-4 shrink-0" />
		<p>
			{m.purchasing_banner_waiting({
				reason: approval.pending.reason,
				value: formatETB(approval.pending.value),
				who: approval.pending.requestedBy ?? m.purchasing_someone()
			})}
			<a class="underline" href={resolve('/dashboard/approvals')}>{m.purchasing_banner_link()}</a>
			{m.purchasing_banner_page()}
		</p>
	</div>
{:else if approval.last?.status === 'rejected'}
	<div
		class="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm"
	>
		<ShieldX class="mt-0.5 size-4 shrink-0" />
		<p>
			{m.purchasing_banner_rejected({
				who: approval.last.decidedBy ?? m.purchasing_an_approver(),
				note: approval.last.decisionNote ? `: “${approval.last.decisionNote}”` : '.'
			})}
		</p>
	</div>
{/if}
