<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import FileText from '@lucide/svelte/icons/file-text';
	import Unlink from '@lucide/svelte/icons/unlink';
	import * as Card from '@nahu/admin-kit/components/ui/card/index.js';
	import { Badge } from '@nahu/admin-kit/components/ui/badge/index.js';
	import { Button } from '@nahu/admin-kit/components/ui/button/index.js';
	import { fileUrl } from '@nahu/admin-kit/files';
	import { formatEthiopianDate } from '@nahu/admin-kit/global';
	import type { PageData } from './$types';
	import PaymentForms from './PaymentForms.svelte';
	import { signed } from '../../../transactions/columns';

	let { pay, canManage }: { pay: PageData['pay']; canManage: boolean } = $props();

	const p = $derived(pay.payment);
</script>

<Card.Root>
	<Card.Header>
		<Card.Title>Payment</Card.Title>
		<Card.Description
			>The money that went with this document, with its screenshots and receipts.</Card.Description
		>
	</Card.Header>
	<Card.Content class="flex flex-col gap-4">
		{#if p}
			<div class="flex flex-wrap items-start justify-between gap-4">
				<div class="flex flex-col gap-1">
					<a
						class="text-lg font-semibold hover:underline {p.status === 'void'
							? 'text-muted-foreground line-through'
							: ''}"
						href={resolve('/dashboard/transactions/[id]', { id: String(p.id) })}
					>
						{signed(p.direction, p.amount)}
					</a>
					<p class="text-sm text-muted-foreground">
						{formatEthiopianDate(new Date(`${p.occurredOn}T12:00:00+03:00`))}
						{#if p.method}· {p.method}{/if}
						{#if p.party}· {p.party}{/if}
					</p>
					<p class="text-sm">
						{#if p.reference}Ref. <span class="font-mono">{p.reference}</span>{/if}
						{#if p.receiptNumber}· Receipt {p.receiptNumber}{/if}
					</p>
					<div>
						<Badge
							variant={p.status === 'verified'
								? 'default'
								: p.status === 'void'
									? 'destructive'
									: 'secondary'}
						>
							{p.status === 'recorded' ? 'not yet verified' : p.status}
						</Badge>
					</div>
				</div>
				{#if canManage}
					<form method="POST" action="?/unlinkTransaction" use:enhance>
						<Button type="submit" variant="ghost" size="sm"><Unlink /> Unlink</Button>
					</form>
				{/if}
			</div>
			{#if pay.paymentFiles.length}
				<div class="flex flex-wrap gap-2">
					{#each pay.paymentFiles as file (file.fileName)}
						<a
							href={resolve('/dashboard/files/[name]', { name: file.fileName })}
							target="_blank"
							rel="noopener"
							class="block rounded border"
						>
							{#if file.mimeType?.startsWith('image/')}
								<img
									src={fileUrl(file.fileName)}
									alt="Payment attachment"
									class="h-20 w-20 rounded object-cover"
								/>
							{:else}
								<div class="flex h-20 w-20 items-center justify-center bg-muted">
									<FileText class="text-muted-foreground" />
								</div>
							{/if}
						</a>
					{/each}
				</div>
			{/if}
		{:else}
			<p class="text-muted-foreground">No payment linked.</p>
			{#if pay.canPay}
				<PaymentForms
					paymentForm={pay.paymentForm}
					linkForm={pay.linkForm}
					methods={pay.methods}
					branches={pay.branches}
					suppliers={pay.suppliers}
					customers={pay.customers}
					linkable={pay.linkable}
					suggestedAmount={pay.suggestedAmount}
					totals={pay.totals}
					withholding={pay.withholding}
				/>
			{/if}
		{/if}
	</Card.Content>
</Card.Root>
