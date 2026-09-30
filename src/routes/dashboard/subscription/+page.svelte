<script lang="ts">
	import { enhance as formEnhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import CreditCard from '@lucide/svelte/icons/credit-card';
	import Landmark from '@lucide/svelte/icons/landmark';
	import RefreshCw from '@lucide/svelte/icons/refresh-cw';
	import Upload from '@lucide/svelte/icons/upload';
	import { Button } from '@nahu/admin-kit/components/ui/button/index.js';
	import * as Card from '@nahu/admin-kit/components/ui/card/index.js';
	import PageHeader from '@nahu/admin-kit/components/PageHeader.svelte';
	import PageSection from '@nahu/admin-kit/components/PageSection.svelte';
	import Notice from '@nahu/admin-kit/components/Notice.svelte';
	import DataTable from '@nahu/admin-kit/components/Table/data-table.svelte';
	import Statuses from '@nahu/admin-kit/components/Table/statuses.svelte';
	import Copy from '@nahu/admin-kit/Copy.svelte';
	import Errors from '@nahu/admin-kit/formComponents/Errors.svelte';
	import FileUpload from '@nahu/admin-kit/formComponents/FileUpload.svelte';
	import InputComp from '@nahu/admin-kit/formComponents/InputComp.svelte';
	import LoadingBtn from '@nahu/admin-kit/formComponents/LoadingBtn.svelte';
	import { createForm } from '@nahu/admin-kit/forms/createForm';
	import { formatETB } from '@nahu/admin-kit/global';
	import { ethiopianDateTime } from '@nahu/admin-kit/tableCells';
	import PackagePicker from '$lib/components/PackagePicker.svelte';
	import {
		GRACE_DAYS,
		PAYMENT_METHOD_LABELS,
		SUBSCRIPTION_STATUS_BADGE,
		SUBSCRIPTION_STATUS_LABELS,
		branchesText,
		frequencyText,
		periodText,
		priceText,
		usersText
	} from '$lib/billing';
	import { ethiopianDay } from '$lib/format';
	import { transferSchema } from '$lib/schemas/billing';
	import { SITE, telNumber } from '$lib/site';
	import { m } from '$lib/paraglide/messages.js';
	import { columns } from './columns';

	let { data } = $props();

	const sub = $derived(data.subscription);
	const manage = $derived(data.manage);
	const blocked = $derived(!sub.allowed);

	/** Why the business is stopped, for the notice at the top. */
	const blockedText = $derived.by(() => {
		if (sub.status === 'suspended') {
			return m.billing_blocked_suspended({
				reason: sub.suspendedReason ?? m.billing_blocked_no_reason()
			});
		}
		// Still on the trial's end date: nothing was ever paid.
		if (sub.trialEndsOn && sub.paidUntil <= sub.trialEndsOn) {
			return m.billing_blocked_trial({ date: ethiopianDay(sub.paidUntil) });
		}
		return m.billing_blocked_unpaid({ date: ethiopianDay(sub.paidUntil), grace: GRACE_DAYS });
	});

	/** The line under the status: what the dates mean for the state the subscription is in. */
	const statusLine = $derived.by(() => {
		const date = ethiopianDay(sub.paidUntil);
		switch (sub.status) {
			case 'complimentary':
				return m.billing_line_complimentary();
			case 'trial':
				return m.billing_line_trial({ date, days: sub.daysLeft });
			case 'active':
				return m.billing_line_active({ date, days: sub.daysLeft });
			case 'due':
				return m.billing_line_due({
					date,
					until: sub.graceEndsOn ? ethiopianDay(sub.graceEndsOn) : date
				});
			case 'blocked':
				return m.billing_line_blocked({ date });
			case 'suspended':
				return m.billing_line_suspended();
		}
	});

	/* ── Paying (owners) ──────────────────────────────────────────────────────────────────── */

	let showTransfer = $state(false);
	let paying = $state(false);
	let checking = $state(false);

	// svelte-ignore state_referenced_locally
	const { form, errors, enhance, delayed, allErrors } = createForm(
		data.transferForm,
		transferSchema,
		{
			invalidateAll: true,
			resetForm: false,
			onUpdated({ form }) {
				if (form.message?.type === 'success') showTransfer = false;
			}
		}
	);

	const chosen = $derived(manage?.packages.find((p) => p.id === Number($form.packageId)));
	const canPay = $derived(sub.status !== 'complimentary' && sub.status !== 'suspended');

	/** Asks Chapa again about the checkout that was opened and not confirmed. */
	async function checkAgain() {
		checking = true;
		await invalidateAll();
		checking = false;
	}
</script>

<div class="flex flex-col gap-6">
	<PageHeader title={m.billing_title()} description={m.billing_intro({ business: data.business })}>
		{#snippet badges()}
			<Statuses
				status={SUBSCRIPTION_STATUS_BADGE[sub.status]}
				label={SUBSCRIPTION_STATUS_LABELS[sub.status]}
			/>
		{/snippet}
	</PageHeader>

	{#if blocked}
		<Notice
			tone="danger"
			title={sub.status === 'suspended' ? m.billing_suspended_title() : m.billing_blocked_title()}
		>
			<p>{blockedText}</p>
			<p class="mt-1">
				{#if sub.status === 'suspended'}
					{m.billing_blocked_contact()}
				{:else if data.canManage}
					{m.billing_blocked_owner()}
				{:else}
					{m.billing_blocked_staff()}
				{/if}
			</p>
		</Notice>
	{:else if sub.status === 'due'}
		<Notice tone="warning" title={m.billing_due_title()}>{statusLine}</Notice>
	{/if}

	{#if data.outcome?.status === 'paid'}
		<Notice tone="success" title={m.billing_outcome_paid_title()}>
			{m.billing_outcome_paid({ date: ethiopianDay(sub.paidUntil) })}
		</Notice>
	{:else if data.outcome?.status === 'failed'}
		<Notice tone="danger" title={m.billing_outcome_failed_title()}>{data.outcome.reason}</Notice>
	{:else if data.outcome}
		<Notice tone="warning" title={m.billing_outcome_pending_title()}>
			{data.outcome.reason}
			{#snippet actions()}
				<Button size="sm" variant="outline" onclick={checkAgain} disabled={checking}>
					<RefreshCw class={checking ? 'animate-spin' : ''} />
					{m.billing_check_again()}
				</Button>
			{/snippet}
		</Notice>
	{/if}

	{#if manage?.openAttempt}
		{@const attempt = manage.openAttempt}
		<Notice tone="info" title={m.billing_open_attempt_title()}>
			{m.billing_open_attempt({ time: ethiopianDateTime(attempt.createdAt) })}
			{#snippet actions()}
				<Button
					size="sm"
					variant="outline"
					href="{resolve('/dashboard/subscription')}?ref={encodeURIComponent(attempt.txRef)}"
				>
					<RefreshCw />{m.billing_check_again()}
				</Button>
			{/snippet}
		</Notice>
	{/if}

	{#if manage?.pendingTransfer}
		<Notice tone="info" title={m.billing_transfer_waiting_title()}>
			{m.billing_transfer_waiting({
				amount: formatETB(manage.pendingTransfer.amount),
				time: ethiopianDateTime(manage.pendingTransfer.createdAt)
			})}
		</Notice>
	{:else if manage?.rejected}
		<Notice tone="danger" title={m.billing_transfer_rejected_title()}>
			{m.billing_transfer_rejected({
				amount: formatETB(manage.rejected.amount),
				reason: manage.rejected.reviewNote ?? m.billing_blocked_no_reason()
			})}
		</Notice>
	{/if}

	<!-- What the owner asked to see at a glance: package, status, last payment, what is unpaid. -->
	<div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" data-tour="subscription-status">
		<Card.Root>
			<Card.Header>
				<Card.Description>{m.billing_package()}</Card.Description>
				<Card.Title class="text-2xl">{sub.package.name}</Card.Title>
			</Card.Header>
			<Card.Content class="text-sm text-muted-foreground">
				<p>{usersText(sub.package.maxUsers)} · {branchesText(sub.package.maxBranches)}</p>
				<p>
					{priceText(sub.package.price)}
					{m.site_price_per({ period: periodText(sub.package.billingMonths) })}
				</p>
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Header>
				<Card.Description>{m.common_status()}</Card.Description>
				<Card.Title class="text-2xl">{SUBSCRIPTION_STATUS_LABELS[sub.status]}</Card.Title>
			</Card.Header>
			<Card.Content class="text-sm text-muted-foreground">
				<p>{statusLine}</p>
				<p>
					{sub.allowed
						? m.billing_stock_active({ business: data.business })
						: m.billing_stock_blocked({ business: data.business })}
				</p>
			</Card.Content>
		</Card.Root>

		{#if manage}
			<Card.Root>
				<Card.Header>
					<Card.Description>{m.billing_last_payment()}</Card.Description>
					<Card.Title class="text-2xl">
						{manage.lastPayment ? formatETB(manage.lastPayment.amount) : m.billing_no_payment_yet()}
					</Card.Title>
				</Card.Header>
				<Card.Content class="text-sm text-muted-foreground">
					{#if manage.lastPayment}
						<p>
							{manage.lastPayment.paidAt ? ethiopianDateTime(manage.lastPayment.paidAt) : ''}
						</p>
						<p>
							{PAYMENT_METHOD_LABELS[manage.lastPayment.method]} · {manage.lastPayment.packageName}
						</p>
					{:else}
						<p>{m.billing_no_payment_hint()}</p>
					{/if}
				</Card.Content>
			</Card.Root>

			<Card.Root class={sub.paymentDue ? 'border-amber-500/60' : ''}>
				<Card.Header>
					<Card.Description>{m.billing_unpaid()}</Card.Description>
					<Card.Title class="text-2xl">
						{sub.paymentDue ? formatETB(sub.package.price) : m.billing_nothing_due()}
					</Card.Title>
				</Card.Header>
				<Card.Content class="text-sm text-muted-foreground">
					{#if sub.status === 'complimentary'}
						<p>{m.billing_line_complimentary()}</p>
					{:else if sub.paymentDue}
						<p>
							{sub.daysLeft >= 0
								? m.billing_due_by({ date: ethiopianDay(sub.paidUntil) })
								: m.billing_due_since({ date: ethiopianDay(sub.paidUntil) })}
						</p>
						<p>{frequencyText(sub.package.billingMonths)}</p>
					{:else}
						<p>{m.billing_next_payment({ date: ethiopianDay(sub.paidUntil) })}</p>
					{/if}
				</Card.Content>
			</Card.Root>
		{/if}
	</div>

	{#if manage}
		<p class="text-sm text-muted-foreground">
			{m.billing_usage({
				users: manage.usage.users,
				maxUsers: sub.package.maxUsers ?? '∞',
				branches: manage.usage.branches,
				maxBranches: sub.package.maxBranches ?? '∞'
			})}
		</p>

		{#if canPay && manage.packages.length}
			<div data-tour="subscription-pay">
				<PageSection title={m.billing_pay_title()} hint={m.billing_pay_hint()}>
					<Card.Root>
						<Card.Content class="flex flex-col gap-5">
							<PackagePicker
								packages={manage.packages}
								bind:value={$form.packageId}
								current={sub.package.id}
							/>

							{#if chosen}
								<p class="text-sm text-muted-foreground">
									{m.billing_pay_summary({
										amount: priceText(chosen.price),
										package: chosen.name,
										period: periodText(chosen.billingMonths)
									})}
								</p>
							{/if}

							<div class="flex flex-wrap gap-2">
								{#if manage.chapa}
									<form
										method="POST"
										action="?/pay"
										class="contents"
										use:formEnhance={() => {
											paying = true;
											return async ({ update }) => {
												await update();
												paying = false;
											};
										}}
									>
										<input type="hidden" name="packageId" value={$form.packageId} />
										<Button type="submit" size="lg" disabled={paying || !chosen}>
											<CreditCard />
											{paying
												? m.billing_opening_chapa()
												: m.billing_pay_chapa({ amount: chosen ? priceText(chosen.price) : '' })}
										</Button>
									</form>
								{/if}
								{#if manage.accounts.length && !showTransfer}
									<Button
										size="lg"
										variant={manage.chapa ? 'outline' : 'default'}
										onclick={() => (showTransfer = true)}
									>
										<Landmark />
										{manage.pendingTransfer ? m.billing_transfer_again() : m.billing_pay_bank()}
									</Button>
								{/if}
							</div>
							{#if manage.chapa}
								<p class="text-xs text-muted-foreground">{m.billing_chapa_note()}</p>
							{/if}
							{#if !manage.chapa && !manage.accounts.length}
								<Notice tone="warning">
									{m.billing_no_way_to_pay()}
									<a class="underline" href="mailto:{SITE.email}">{SITE.email}</a>,
									<a class="underline" href="tel:{telNumber(SITE.phones[0])}">{SITE.phones[0]}</a>
								</Notice>
							{/if}

							{#if showTransfer}
								<div class="flex flex-col gap-4 border-t pt-5">
									<div>
										<h3>{m.billing_transfer_title()}</h3>
										<p class="text-sm text-muted-foreground">
											{m.billing_transfer_hint({ amount: chosen ? priceText(chosen.price) : '' })}
										</p>
									</div>

									<form
										method="POST"
										action="?/transfer"
										enctype="multipart/form-data"
										use:enhance
										class="flex flex-col gap-4"
									>
										<Errors allErrors={$allErrors} />
										<input type="hidden" name="packageId" value={$form.packageId} />

										<fieldset class="grid gap-2">
											<legend class="mb-2 text-sm font-medium">{m.billing_transfer_to()}</legend>
											{#each manage.accounts as account (account.id)}
												<label class="account">
													<input
														type="radio"
														name="bankAccountId"
														value={account.id}
														bind:group={$form.bankAccountId}
													/>
													<span class="flex min-w-0 flex-col">
														<span class="font-medium">{account.bankName}</span>
														<span class="text-sm text-muted-foreground">{account.accountName}</span>
													</span>
													<span class="font-medium tabular-nums">
														<Copy data={account.accountNumber} />
													</span>
												</label>
											{/each}
											{#if $errors.bankAccountId}
												<span class="text-sm text-destructive">{$errors.bankAccountId}</span>
											{/if}
										</fieldset>

										<InputComp
											{form}
											{errors}
											name="reference"
											label={m.billing_transfer_reference()}
											placeholder={m.billing_transfer_reference_placeholder()}
										/>

										<div class="flex flex-col gap-2">
											<span class="text-sm font-medium">{m.billing_transfer_receipt()}</span>
											<FileUpload {form} name="receipt" placeholder={m.sales_file_placeholder()} />
											{#if $errors.receipt}
												<span class="text-sm text-destructive">{$errors.receipt}</span>
											{/if}
										</div>

										<div class="flex flex-wrap gap-2">
											<Button type="submit" disabled={$delayed}>
												{#if $delayed}
													<LoadingBtn name={m.billing_uploading()} />
												{:else}
													<Upload />{m.billing_send_receipt()}
												{/if}
											</Button>
											<Button type="button" variant="ghost" onclick={() => (showTransfer = false)}>
												{m.common_cancel()}
											</Button>
										</div>
									</form>
								</div>
							{/if}
						</Card.Content>
					</Card.Root>
				</PageSection>
			</div>
		{/if}

		<PageSection title={m.billing_history_title()} hint={m.billing_history_hint()}>
			<DataTable
				data={manage.payments}
				{columns}
				variant="compact"
				fileName={m.billing_history_title()}
			/>
		</PageSection>
	{/if}

	<p class="text-sm text-muted-foreground">
		{m.billing_help()}
		<a class="underline" href="mailto:{SITE.email}">{SITE.email}</a>,
		<a class="underline" href="tel:{telNumber(SITE.phones[0])}">{SITE.phones[0]}</a>
	</p>
</div>

<style>
	.account {
		display: grid;
		grid-template-columns: auto 1fr auto;
		gap: 0.85rem;
		align-items: center;
		padding: 0.7rem 1rem;
		border: 1px solid var(--border);
		border-radius: 4px;
		cursor: pointer;
	}
	.account:has(input:checked) {
		border-color: var(--foreground);
		box-shadow: inset 0.4rem 0 0 0 var(--brand-green);
		background: var(--accent);
	}
	.account input {
		width: 1.1rem;
		height: 1.1rem;
		accent-color: var(--primary);
	}
</style>
