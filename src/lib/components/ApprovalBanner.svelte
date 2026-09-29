<script lang="ts">
	import { resolve } from '$app/paths';
	import ShieldCheck from '@lucide/svelte/icons/shield-check';
	import ShieldX from '@lucide/svelte/icons/shield-x';
	import Notice from '@nahu/admin-kit/components/Notice.svelte';
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
	<Notice tone="warning" icon={ShieldCheck}>
		{m.purchasing_banner_waiting({
			reason: approval.pending.reason,
			value: formatETB(approval.pending.value),
			who: approval.pending.requestedBy ?? m.purchasing_someone()
		})}
		<a class="underline" href={resolve('/dashboard/approvals')}>{m.purchasing_banner_link()}</a>
		{m.purchasing_banner_page()}
	</Notice>
{:else if approval.last?.status === 'rejected'}
	<Notice tone="danger" icon={ShieldX}>
		{m.purchasing_banner_rejected({
			who: approval.last.decidedBy ?? m.purchasing_an_approver(),
			note: approval.last.decisionNote ? `: “${approval.last.decisionNote}”` : '.'
		})}
	</Notice>
{/if}
