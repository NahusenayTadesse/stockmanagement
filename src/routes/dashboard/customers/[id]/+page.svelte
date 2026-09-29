<script lang="ts">
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
	import { customerEdit, receivePayment } from '$lib/schemas/customers';

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
			name: 'Phone',
			value: c.phone ?? '—',
			href: c.phone ? `tel:${c.phone.replace(/[^+0-9]/g, '')}` : null
		},
		{ name: 'Email', value: c.email ?? '—', href: c.email ? `mailto:${c.email}` : null },
		{ name: 'Address', value: c.address ?? '—', href: null },
		{ name: 'TIN', value: c.tin ?? '—', href: null },
		{
			name: 'Credit',
			value:
				c.creditLimit === null
					? `No limit · ${c.creditDays} days to pay`
					: c.creditLimit === 0
						? 'Cash only'
						: `Up to ${formatETB(c.creditLimit)} · ${c.creditDays} days to pay`,
			href: null
		},
		{ name: 'Note', value: c.note ?? '—', href: null }
	]);

	const tiles = $derived<Stat[]>([
		{
			key: 'owed',
			label: credit.balance < 0 ? 'In credit' : 'Owes',
			value: Math.abs(credit.balance),
			format: 'money',
			group: 'c',
			hint:
				credit.available === null
					? 'No credit limit'
					: credit.overLimit
						? `Over the limit of ${formatETB(credit.creditLimit)}`
						: `${formatETB(credit.available)} of credit left`,
			tone: credit.overLimit ? 'negative' : credit.balance > 0 ? 'warning' : 'positive'
		},
		{
			key: 'overdue',
			label: 'Overdue',
			value: credit.overdue,
			format: 'money',
			group: 'c',
			hint: credit.overdue ? `Oldest ${credit.oldestOverdueDays} days late` : 'Nothing late',
			tone: credit.overdue ? 'negative' : 'neutral'
		},
		{
			key: 'sold',
			label: 'Bought',
			value: credit.sold,
			format: 'money',
			group: 'c',
			hint: `At sale prices · ${formatETB(data.totals.taken)} at cost`
		},
		{
			key: 'paid',
			label: 'Paid',
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
			<p class="text-sm text-muted-foreground">Customer</p>
			<h1 class="flex items-center gap-2 text-2xl font-semibold">
				{c.name}
				{#if !c.isActive}<Badge variant="secondary">inactive</Badge>{/if}
				{#if credit.overLimit}<Badge variant="destructive">over credit limit</Badge>{/if}
			</h1>
		</div>
		<div class="flex flex-wrap gap-2">
			<Button
				href={resolve('/dashboard/customers/[id]/statement', { id: String(c.id) })}
				target="_blank"
				variant="outline"><Printer /> Statement</Button
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
						{emailing ? 'Sending…' : 'Email statement'}
					</Button>
				</form>
			{/if}
			{#if data.canManage}
				<DialogComp bind:open title="Edit customer" variant="outline" IconComp={Pencil}>
					<form
						method="POST"
						action="?/edit"
						use:editEnhance
						id="edit-customer"
						class="flex flex-col gap-4"
					>
						<Errors allErrors={$allErrors} />
						<CustomerFields {form} {errors} />
						<InputComp
							{form}
							{errors}
							name="status"
							type="select"
							label="Status"
							items={[
								{ value: true, name: 'Active' },
								{ value: false, name: 'Inactive — hidden from the pickers, history kept' }
							]}
						/>
						<Button type="submit" form="edit-customer">
							{#if $delayed}<LoadingBtn name="Saving" />{:else}Save{/if}
						</Button>
					</form>
				</DialogComp>
			{/if}
			{#if data.canReceive}
				<DialogComp
					bind:open={payOpen}
					title="Receive payment"
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
							{c.name} owes {formatETB(Math.max(0, credit.balance))}. The payment is applied to the
							oldest purchases first.
						</p>
						<Errors allErrors={$payAll} />
						<InputComp
							form={payData}
							errors={payErrors}
							name="amount"
							type="number"
							step="0.01"
							label="Amount (ETB)"
							required
						/>
						<InputComp
							form={payData}
							errors={payErrors}
							name="occurredOn"
							type="date"
							label="Date received"
							year
							required
						/>
						<InputComp
							form={payData}
							errors={payErrors}
							name="paymentMethodId"
							type="select"
							label="Paid by"
							items={data.methods}
						/>
						<InputComp
							form={payData}
							errors={payErrors}
							name="reference"
							label="Transaction reference"
							placeholder="Bank FT number, Telebirr ID, cheque no."
							description="Checked against every other transaction: the same payment cannot be recorded twice."
						/>
						<InputComp
							form={payData}
							errors={payErrors}
							name="receiptNumber"
							label="Receipt no. given"
						/>
						<InputComp
							form={payData}
							errors={payErrors}
							name="withheld"
							type="number"
							step="0.01"
							label="Tax they withheld (ETB)"
							description={c.withholdsTax
								? 'A withholding agent: they keep back part of the amount before VAT and give you a withholding receipt. It counts as paid.'
								: 'Only if they kept back tax and gave you a withholding receipt.'}
						/>
						{#if Number($payData.withheld) > 0}
							<InputComp
								form={payData}
								errors={payErrors}
								name="withholdingReceipt"
								label="Withholding receipt no."
							/>
						{/if}
						<InputComp form={payData} errors={payErrors} name="description" label="Note" />
						<Button type="submit" form="receive-payment">
							{#if $payDelayed}<LoadingBtn name="Saving" />{:else}Record payment{/if}
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
				<Card.Title>Unpaid purchases</Card.Title>
				<Card.Description
					>Oldest first; payments are applied to them in this order.</Card.Description
				>
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
								{day(o.docDate)} · due {day(o.dueDate)}
							</span>
							<span class="flex items-center gap-2">
								<span class="font-medium">{formatETB(o.remaining)}</span>
								{#if o.remaining < o.value}<span class="text-xs text-muted-foreground"
										>of {formatETB(o.value)}</span
									>{/if}
								{#if o.daysOverdue > 0}<Badge variant="destructive">{o.daysOverdue} days late</Badge
									>{/if}
							</span>
						</li>
					{:else}
						<li class="py-2 text-muted-foreground">Nothing unpaid.</li>
					{/each}
				</ul>
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Header>
				<Card.Title>Contact</Card.Title>
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
			<Card.Title>Recent account activity</Card.Title>
			<Card.Description>The full history is on the statement.</Card.Description>
		</Card.Header>
		<Card.Content class="overflow-x-auto">
			<table class="w-full text-sm">
				<thead class="text-left text-muted-foreground">
					<tr>
						<th class="py-1 pr-2">Date</th>
						<th class="py-1 pr-2">What</th>
						<th class="py-1 pr-2 text-right">Bought</th>
						<th class="py-1 pr-2 text-right">Paid</th>
						<th class="py-1 text-right">Balance</th>
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
						<tr
							><td colspan="5" class="py-3 text-muted-foreground">No purchases or payments yet.</td
							></tr
						>
					{/each}
				</tbody>
			</table>
		</Card.Content>
	</Card.Root>
</div>
