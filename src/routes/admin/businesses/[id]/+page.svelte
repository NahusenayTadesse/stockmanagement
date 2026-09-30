<script lang="ts">
	import Play from '@lucide/svelte/icons/play';
	import PageHeader from '@nahu/admin-kit/components/PageHeader.svelte';
	import PageSection from '@nahu/admin-kit/components/PageSection.svelte';
	import Notice from '@nahu/admin-kit/components/Notice.svelte';
	import ConfirmAction from '@nahu/admin-kit/components/ConfirmAction.svelte';
	import SingleTable from '@nahu/admin-kit/components/SingleTable.svelte';
	import DataTable from '@nahu/admin-kit/components/Table/data-table.svelte';
	import Statuses from '@nahu/admin-kit/components/Table/statuses.svelte';
	import * as Card from '@nahu/admin-kit/components/ui/card/index.js';
	import FormDialog from '@nahu/admin-kit/formComponents/FormDialog.svelte';
	import InputComp from '@nahu/admin-kit/formComponents/InputComp.svelte';
	import { formatETB } from '@nahu/admin-kit/global';
	import { ethiopianDateTime } from '@nahu/admin-kit/tableCells';
	import {
		SUBSCRIPTION_STATUS_BADGE,
		SUBSCRIPTION_STATUS_LABELS,
		periodText,
		priceText
	} from '$lib/billing';
	import { ethiopianDay } from '$lib/format';
	import { manualPaymentSchema, subscriptionSchema, suspendSchema } from '$lib/schemas/billing';
	import ReceiptReview from '../../ReceiptReview.svelte';
	import { paymentColumns } from '../../paymentColumns';
	import { m } from '$lib/paraglide/messages.js';

	let { data } = $props();

	const b = $derived(data.business);
	const columns = paymentColumns({ withBusiness: false });

	/** Packages as a picker reads them: the name with what a period costs. */
	const packageItems = $derived(
		data.packages.map((p) => ({
			value: p.value,
			name: `${p.name} — ${priceText(p.price)} ${m.site_price_per({ period: periodText(p.billingMonths) })}`
		}))
	);

	const day = (value: string | null) => (value ? ethiopianDay(value) : '—');

	const facts = $derived([
		{ name: m.platform_col_owner(), value: b.owner ?? '—' },
		{ name: m.common_email(), value: b.ownerEmail ?? '—' },
		{ name: m.common_phone(), value: b.phone ?? '', kind: 'phone' as const },
		{ name: 'TIN', value: b.tin ?? '—' },
		{ name: m.platform_col_registered(), value: ethiopianDateTime(b.createdAt) },
		{ name: m.billing_package(), value: b.packageName ?? '—' },
		{
			name: m.common_status(),
			value: b.status ? SUBSCRIPTION_STATUS_BADGE[b.status] : '',
			kind: 'status' as const,
			label: b.status ? SUBSCRIPTION_STATUS_LABELS[b.status] : '—'
		},
		{ name: m.platform_fact_started(), value: day(b.startedOn) },
		{ name: m.platform_fact_trial_ends(), value: day(b.trialEndsOn) },
		{ name: m.platform_col_paid_until(), value: day(b.paidUntil) },
		{
			name: m.platform_col_users(),
			value: b.maxUsers === null ? String(b.users) : `${b.users} / ${b.maxUsers}`
		},
		{ name: m.platform_col_total_paid(), value: formatETB(b.totalPaid) },
		{
			name: m.billing_last_payment(),
			value: b.lastPaidAt ? ethiopianDateTime(b.lastPaidAt) : m.billing_no_payment_yet()
		}
	]);
</script>

<div class="flex flex-col gap-6">
	<PageHeader title={b.name} eyebrow={m.platform_business()} tabTitle={b.name}>
		{#snippet badges()}
			{#if b.status}
				<Statuses
					status={SUBSCRIPTION_STATUS_BADGE[b.status]}
					label={SUBSCRIPTION_STATUS_LABELS[b.status]}
				/>
			{/if}
		{/snippet}
		{#snippet actions()}
			<FormDialog
				title={m.platform_change_subscription()}
				description={m.platform_change_subscription_hint()}
				triggerLabel={m.platform_change_subscription()}
				action="?/subscription"
				data={data.subscriptionForm}
				schema={subscriptionSchema}
			>
				{#snippet fields({ form, errors })}
					<InputComp
						{form}
						{errors}
						name="packageId"
						type="select"
						label={m.billing_package()}
						items={packageItems}
						required
					/>
					<InputComp
						{form}
						{errors}
						name="paidUntil"
						type="date"
						label={m.platform_col_paid_until()}
						description={m.platform_paid_until_hint()}
						futureDays
						year
						required
					/>
					<InputComp
						{form}
						{errors}
						name="complimentary"
						type="checkboxSingle"
						label={m.billing_status_complimentary()}
						placeholder={m.platform_complimentary_hint()}
					/>
				{/snippet}
			</FormDialog>

			<FormDialog
				title={m.platform_record_payment()}
				description={m.platform_record_payment_hint()}
				triggerLabel={m.platform_record_payment()}
				submitLabel={m.platform_record_payment()}
				action="?/payment"
				data={data.paymentForm}
				schema={manualPaymentSchema}
				resetOnSuccess
			>
				{#snippet fields({ form, errors })}
					<InputComp
						{form}
						{errors}
						name="packageId"
						type="select"
						label={m.billing_package()}
						items={packageItems}
						required
					/>
					<InputComp
						{form}
						{errors}
						name="amount"
						type="number"
						step="0.01"
						label={m.sales_amount_etb()}
						required
					/>
					<InputComp
						{form}
						{errors}
						name="note"
						label={m.common_note()}
						placeholder={m.platform_record_note_placeholder()}
					/>
				{/snippet}
			</FormDialog>

			{#if b.status === 'suspended'}
				<ConfirmAction
					action="?/resume"
					label={m.platform_resume()}
					title={m.platform_resume_title({ business: b.name })}
					description={m.platform_resume_hint()}
					icon={Play}
					variant="outline"
				/>
			{:else}
				<FormDialog
					title={m.platform_suspend()}
					description={m.platform_suspend_hint()}
					triggerLabel={m.platform_suspend()}
					submitLabel={m.platform_suspend()}
					action="?/suspend"
					data={data.suspendForm}
					schema={suspendSchema}
					resetOnSuccess
				>
					{#snippet fields({ form, errors })}
						<InputComp
							{form}
							{errors}
							name="reason"
							type="textarea"
							rows={3}
							label={m.platform_suspend_reason()}
							required
						/>
					{/snippet}
				</FormDialog>
			{/if}
		{/snippet}
	</PageHeader>

	{#if b.status === 'suspended'}
		<Notice tone="danger" title={m.billing_status_suspended()}>{b.suspendedReason}</Notice>
	{/if}

	<Card.Root>
		<Card.Content><SingleTable singleTable={facts} /></Card.Content>
	</Card.Root>

	{#if data.receipts.length}
		<PageSection title={m.platform_receipts_title()} hint={m.platform_receipts_hint()}>
			<ReceiptReview receipts={data.receipts} />
		</PageSection>
	{/if}

	<PageSection title={m.platform_nav_payments()}>
		<DataTable data={data.payments} {columns} variant="compact" fileName={b.name} />
	</PageSection>
</div>
