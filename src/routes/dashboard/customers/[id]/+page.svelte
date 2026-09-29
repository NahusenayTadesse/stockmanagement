<script lang="ts">
	import BigText from '@nahu/admin-kit/components/Table/bigText.svelte';
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import Banknote from '@lucide/svelte/icons/banknote';
	import Mail from '@lucide/svelte/icons/mail';
	import Pencil from '@lucide/svelte/icons/pencil';
	import Printer from '@lucide/svelte/icons/printer';
	import StatCard from '@nahu/admin-kit/components/reports/StatCard.svelte';
	import type { Stat } from '@nahu/admin-kit/components/reports/types';
	import * as Card from '@nahu/admin-kit/components/ui/card/index.js';
	import { Badge } from '@nahu/admin-kit/components/ui/badge/index.js';
	import { Button } from '@nahu/admin-kit/components/ui/button/index.js';
	import DialogComp from '@nahu/admin-kit/formComponents/DialogComp.svelte';
	import InputComp from '@nahu/admin-kit/formComponents/InputComp.svelte';
	import LoadingBtn from '@nahu/admin-kit/formComponents/LoadingBtn.svelte';
	import Errors from '@nahu/admin-kit/formComponents/Errors.svelte';
	import { createForm } from '@nahu/admin-kit/forms/createForm';
	import { formatETB, formatEthiopianDate } from '@nahu/admin-kit/global';
	import CustomerFields from '$lib/components/CustomerFields.svelte';
	import SmsDialog from '$lib/components/SmsDialog.svelte';
	import { customerEdit, receivePayment } from '$lib/schemas/customers';
	import { m } from '$lib/paraglide/messages.js';

	const SMS_STATUS: Record<string, () => string> = {
		sent: m.sales_sms_status_sent,
		failed: m.sales_sms_status_failed,
		skipped: m.sales_sms_status_skipped,
		dry_run: m.sales_sms_status_dry_run
	};

	let { data } = $props();
	let open = $state(false);
	let payOpen = $state(false);
	let emailing = $state(false);

	// svelte-ignore state_referenced_locally
	const {
		form,
		errors,
		enhance: editEnhance,
		delayed,
		allErrors
	} = createForm(data.form, customerEdit, {
		resetForm: false,
		onUpdated({ form }) {
			if (form.message?.type === 'success') open = false;
		}
	});

	// svelte-ignore state_referenced_locally
	const pay = createForm(data.paymentForm, receivePayment, {
		resetForm: true,
		onUpdated({ form }) {
			if (form.message?.type === 'success') payOpen = false;
		}
	});
	const payData = pay.form;
	const payErrors = pay.errors;
	const payAll = pay.allErrors;
	const payDelayed = pay.delayed;

	const c = $derived(data.customer);
	const credit = $derived(data.credit);
	const day = (d: string) => formatEthiopianDate(new Date(`${d}T12:00:00+03:00`));

	/** A plain list, not the kit's detail table, which capitalises emails. */
	const details = $derived([
		{
			name: m.common_phone(),
			value: c.phone ?? '—',
			href: c.phone ? `tel:${c.phone.replace(/[^+0-9]/g, '')}` : null
		},
		{ name: m.common_email(), value: c.email ?? '—', href: c.email ? `mailto:${c.email}` : null },
		{ name: m.common_address(), value: c.address ?? '—', href: null, long: 60 },
		{ name: 'TIN', value: c.tin ?? '—', href: null },
		{
			name: m.sales_credit_label(),
			value:
				c.creditLimit === null
					? m.sales_credit_no_limit_days({ days: c.creditDays })
					: c.creditLimit === 0
						? m.sales_cash_only()
						: m.sales_credit_up_to({ amount: formatETB(c.creditLimit), days: c.creditDays }),
			href: null
		},
		{ name: m.common_note(), value: c.note ?? '—', href: null, long: 120 }
	]);

	const tiles = $derived<Stat[]>([
		{
			key: 'owed',
			label: credit.balance < 0 ? m.sales_tile_in_credit() : m.sales_owes(),
			value: Math.abs(credit.balance),
			format: 'money',
			group: 'c',
			hint:
				credit.available === null
					? m.sales_no_credit_limit()
					: credit.overLimit
						? m.sales_over_limit_of({ amount: formatETB(credit.creditLimit) })
						: m.sales_credit_left({ amount: formatETB(credit.available) }),
			tone: credit.overLimit ? 'negative' : credit.balance > 0 ? 'warning' : 'positive'
		},
		{
			key: 'overdue',
			label: m.sales_overdue(),
			value: credit.overdue,
			format: 'money',
			group: 'c',
			hint: credit.overdue
				? m.sales_oldest_days_late({ days: credit.oldestOverdueDays })
				: m.sales_nothing_late(),
			tone: credit.overdue ? 'negative' : 'neutral'
		},
		{
			key: 'sold',
			label: m.sales_bought(),
			value: credit.sold,
			format: 'money',
			group: 'c',
			hint: m.sales_bought_hint({ amount: formatETB(data.totals.taken) })
		},
		{
			key: 'paid',
			label: m.sales_paid(),
			value: credit.paid,
			format: 'money',
			group: 'c',
			tone: 'positive'
		}
	]);
</script>

<svelte:head>
	<title>{c.name}</title>
</svelte:head>

<div class="flex flex-col gap-6">
	<div class="flex flex-wrap items-start justify-between gap-4">
		<div class="flex flex-col gap-1">
			<p class="text-sm text-muted-foreground">{m.sales_customer()}</p>
			<h1 class="flex items-center gap-2 text-2xl font-semibold">
				{c.name}
				{#if !c.isActive}<Badge variant="secondary">{m.sales_inactive_badge()}</Badge>{/if}
				{#if credit.overLimit}<Badge variant="destructive"
						>{m.sales_over_credit_limit_badge()}</Badge
					>{/if}
			</h1>
		</div>
		<div class="flex flex-wrap gap-2">
			<Button
				href={resolve('/dashboard/customers/[id]/statement', { id: String(c.id) })}
				target="_blank"
				variant="outline"><Printer /> {m.sales_statement()}</Button
			>
			{#if data.canManage && c.email}
				<form
					method="POST"
					action="?/emailStatement"
					use:enhance={() => {
						emailing = true;
						return async ({ update }) => {
							await update();
							emailing = false;
						};
					}}
				>
					<Button type="submit" variant="outline" disabled={emailing}>
						<Mail />
						{emailing ? m.common_sending() : m.sales_email_statement()}
					</Button>
				</form>
			{/if}
			{#if data.canText}
				{#if credit.balance > 0}
					<SmsDialog
						action="?/smsRemind"
						title={m.sales_text_reminder()}
						phone={c.phone}
						preview={m.sales_reminder_preview({
							amount: formatETB(credit.balance),
							overdue:
								credit.overdue > 0
									? m.sales_of_it_overdue({ amount: formatETB(credit.overdue) })
									: ''
						})}
					/>
				{/if}
				<SmsDialog action="?/smsText" title={m.sales_send_sms()} phone={c.phone} withText />
			{/if}
			{#if data.canManage}
				<DialogComp bind:open title={m.sales_edit_customer()} variant="outline" IconComp={Pencil}>
					<form
						method="POST"
						action="?/edit"
						use:editEnhance
						id="edit-customer"
						class="flex flex-col gap-4"
					>
						<Errors allErrors={$allErrors} />
						<CustomerFields {form} {errors} priceLists={data.priceLists} />
						<InputComp
							{form}
							{errors}
							name="status"
							type="select"
							label={m.common_status()}
							items={[
								{ value: true, name: m.common_active() },
								{ value: false, name: m.sales_inactive_hint() }
							]}
						/>
						<Button type="submit" form="edit-customer">
							{#if $delayed}<LoadingBtn name={m.common_saving()} />{:else}{m.common_save()}{/if}
						</Button>
					</form>
				</DialogComp>
			{/if}
			{#if data.canReceive}
				<DialogComp
					bind:open={payOpen}
					title={m.sales_receive_payment()}
					variant="default"
					IconComp={Banknote}
				>
					<form
						method="POST"
						action="?/receivePayment"
						use:pay.enhance
						id="receive-payment"
						class="flex flex-col gap-4"
					>
						<p class="text-sm text-muted-foreground">
							{m.sales_owes_applied({
								name: c.name,
								amount: formatETB(Math.max(0, credit.balance))
							})}
						</p>
						<Errors allErrors={$payAll} />
						<InputComp
							form={payData}
							errors={payErrors}
							name="amount"
							type="number"
							step="0.01"
							label={m.sales_amount_etb()}
							required
						/>
						<InputComp
							form={payData}
							errors={payErrors}
							name="occurredOn"
							type="date"
							label={m.sales_date_received()}
							year
							required
						/>
						<InputComp
							form={payData}
							errors={payErrors}
							name="paymentMethodId"
							type="select"
							label={m.sales_paid_by()}
							items={data.methods}
						/>
						<InputComp
							form={payData}
							errors={payErrors}
							name="reference"
							label={m.sales_tx_reference()}
							placeholder={m.sales_tx_reference_placeholder()}
							description={m.sales_tx_reference_hint()}
						/>
						<InputComp
							form={payData}
							errors={payErrors}
							name="receiptNumber"
							label={m.sales_receipt_no_given()}
						/>
						<InputComp
							form={payData}
							errors={payErrors}
							name="withheld"
							type="number"
							step="0.01"
							label={m.sales_tax_they_withheld()}
							description={c.withholdsTax ? m.sales_withheld_hint_agent() : m.sales_withheld_hint()}
						/>
						{#if Number($payData.withheld) > 0}
							<InputComp
								form={payData}
								errors={payErrors}
								name="withholdingReceipt"
								label={m.sales_withholding_receipt_no()}
							/>
						{/if}
						<InputComp
							form={payData}
							errors={payErrors}
							name="description"
							label={m.common_note()}
						/>
						<Button type="submit" form="receive-payment">
							{#if $payDelayed}<LoadingBtn
									name={m.common_saving()}
								/>{:else}{m.sales_record_payment()}{/if}
						</Button>
					</form>
				</DialogComp>
			{/if}
		</div>
	</div>

	<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
		{#each tiles as stat (stat.key)}<StatCard {stat} />{/each}
	</div>

	<div class="grid gap-6 lg:grid-cols-2">
		<Card.Root>
			<Card.Header>
				<Card.Title>{m.sales_unpaid_purchases()}</Card.Title>
				<Card.Description>{m.sales_unpaid_intro()}</Card.Description>
			</Card.Header>
			<Card.Content>
				<ul class="divide-y">
					{#each credit.open as o (o.id)}
						<li class="flex flex-wrap items-center justify-between gap-2 py-2">
							<a
								class="hover:underline"
								href={resolve('/dashboard/stock/documents/[id]', { id: String(o.id) })}
								>{o.number ?? `#${o.id}`}</a
							>
							<span class="text-sm text-muted-foreground">
								{day(o.docDate)} · {m.sales_due_date({ date: day(o.dueDate) })}
							</span>
							<span class="flex items-center gap-2">
								<span class="font-medium">{formatETB(o.remaining)}</span>
								{#if o.remaining < o.value}<span class="text-xs text-muted-foreground"
										>{m.sales_of_amount({ amount: formatETB(o.value) })}</span
									>{/if}
								{#if o.daysOverdue > 0}<Badge variant="destructive"
										>{m.sales_days_late({ days: o.daysOverdue })}</Badge
									>{/if}
							</span>
						</li>
					{:else}
						<li class="py-2 text-muted-foreground">{m.sales_nothing_unpaid()}</li>
					{/each}
				</ul>
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Header>
				<Card.Title>{m.sales_contact()}</Card.Title>
			</Card.Header>
			<Card.Content>
				<dl class="grid grid-cols-[auto_1fr] gap-x-6 gap-y-3 text-sm">
					{#each details as row (row.name)}
						<dt class="font-semibold">{row.name}</dt>
						<dd class="break-words">
							{#if row.href}
								<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- tel:/mailto:, not a route -->
								<a class="underline underline-offset-2 hover:no-underline" href={row.href}
									>{row.value}</a
								>
							{:else if 'long' in row}
								<BigText text={row.value} max={row.long} />
							{:else}
								{row.value}
							{/if}
						</dd>
					{/each}
				</dl>
			</Card.Content>
		</Card.Root>
	</div>

	<Card.Root>
		<Card.Header>
			<Card.Title>{m.sales_recent_activity()}</Card.Title>
			<Card.Description>{m.sales_full_history()}</Card.Description>
		</Card.Header>
		<Card.Content class="overflow-x-auto">
			<table class="w-full text-sm">
				<thead class="text-left text-muted-foreground">
					<tr>
						<th class="py-1 pr-2">{m.common_date()}</th>
						<th class="py-1 pr-2">{m.sales_what()}</th>
						<th class="py-1 pr-2 text-right">{m.sales_bought()}</th>
						<th class="py-1 pr-2 text-right">{m.sales_paid()}</th>
						<th class="py-1 text-right">{m.sales_balance()}</th>
					</tr>
				</thead>
				<tbody>
					{#each credit.recent as e (`${e.kind}-${e.id}`)}
						<tr class="border-t">
							<td class="py-1.5 pr-2">{day(e.date)}</td>
							<td class="py-1.5 pr-2">
								{#if e.kind === 'sale' || e.kind === 'return'}
									<a
										class="hover:underline"
										href={resolve('/dashboard/stock/documents/[id]', { id: String(e.id) })}
										>{e.label}</a
									>
								{:else}
									<a
										class="hover:underline"
										href={resolve('/dashboard/transactions/[id]', { id: String(e.id) })}
										>{e.label}</a
									>
								{/if}
								{#if e.reference}<span class="text-xs text-muted-foreground">
										· {e.reference}</span
									>{/if}
							</td>
							<td class="py-1.5 pr-2 text-right">{e.debit ? formatETB(e.debit) : ''}</td>
							<td class="py-1.5 pr-2 text-right">{e.credit ? formatETB(e.credit) : ''}</td>
							<td class="py-1.5 text-right font-medium">{formatETB(e.balance)}</td>
						</tr>
					{:else}
						<tr><td colspan="5" class="py-3 text-muted-foreground">{m.sales_no_activity()}</td></tr>
					{/each}
				</tbody>
			</table>
		</Card.Content>
	</Card.Root>

	{#if data.texts.length}
		<Card.Root>
			<Card.Header>
				<Card.Title>{m.sales_text_messages()}</Card.Title>
				<Card.Description>{m.sales_last_20_texts()}</Card.Description>
			</Card.Header>
			<Card.Content>
				<ul class="flex flex-col divide-y text-sm">
					{#each data.texts as t (t.id)}
						<li class="flex flex-col gap-1 py-2">
							<span class="text-xs text-muted-foreground">
								{new Date(t.createdAt).toLocaleString('en-GB', { timeZone: 'Africa/Addis_Ababa' })} ·
								{t.phone}
								· {t.kind} ·
								<span
									class={t.status === 'failed' || t.status === 'skipped' ? 'text-destructive' : ''}
									>{SMS_STATUS[t.status]?.() ?? t.status}{t.error ? `: ${t.error}` : ''}</span
								>
							</span>
							<span><BigText text={t.body} max={60} /></span>
						</li>
					{/each}
				</ul>
			</Card.Content>
		</Card.Root>
	{/if}
</div>
