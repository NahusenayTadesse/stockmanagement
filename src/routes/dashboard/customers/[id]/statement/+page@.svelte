<script lang="ts">
	import PrintSheet from '@nahu/admin-kit/components/PrintSheet.svelte';
	import { formatETB, formatEthiopianDate } from '@nahu/admin-kit/global';
	import { fileUrl } from '@nahu/admin-kit/files';
	import { m } from '$lib/paraglide/messages.js';

	let { data } = $props();

	const c = $derived(data.customer);
	const s = $derived(data.statement);
	const day = (d: string) => formatEthiopianDate(new Date(`${d}T12:00:00+03:00`));
</script>

<svelte:head>
	<title>{m.sales_statement_title({ name: c.name })}</title>
</svelte:head>

<PrintSheet
	branch={{ name: data.org.name, address: data.org.address, phone: data.org.phone }}
	fallbackName={data.org.name}
>
	<section class="flex items-start justify-between gap-6">
		<div class="flex flex-col gap-1">
			<h1 class="text-xl font-bold">{m.sales_statement_of_account()}</h1>
			<p>{m.sales_as_of({ date: day(data.today), iso: data.today })}</p>
			{#if data.org.tin}<p class="text-sm">{m.sales_tin({ tin: data.org.tin })}</p>{/if}
		</div>
		{#if data.org.logo}
			<img
				src={fileUrl(data.org.logo)}
				alt={m.sales_logo_alt({ name: data.org.name })}
				class="h-20 max-w-48 object-contain"
			/>
		{/if}
	</section>

	<dl class="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
		<dt class="font-semibold">{m.sales_customer()}</dt>
		<dd>
			{c.name}{c.phone ? `, ${c.phone}` : ''}{c.tin
				? `, ${m.sales_tin({ tin: c.tin })}`
				: ''}{c.address ? `, ${c.address}` : ''}
		</dd>
		<dt class="font-semibold">{m.sales_terms()}</dt>
		<dd>
			{c.creditLimit === 0
				? m.sales_cash_only()
				: m.sales_days_to_pay_limit({
						days: c.creditDays,
						limit:
							c.creditLimit !== null ? m.sales_limit_part({ amount: formatETB(c.creditLimit) }) : ''
					})}
		</dd>
		<dt class="font-semibold">{m.sales_balance_due_label()}</dt>
		<dd class="font-bold">
			{s.balance < 0
				? m.sales_in_your_favour({ amount: formatETB(-s.balance) })
				: formatETB(s.balance)}{s.overdue > 0
				? m.sales_overdue_part({ amount: formatETB(s.overdue) })
				: ''}
		</dd>
	</dl>

	<table class="w-full border-collapse text-sm">
		<thead>
			<tr class="border-b-2 text-left">
				<th class="py-1 pr-2">{m.common_date()}</th>
				<th class="py-1 pr-2">{m.sales_details()}</th>
				<th class="py-1 pr-2 text-right">{m.sales_purchases()}</th>
				<th class="py-1 pr-2 text-right">{m.sales_payments()}</th>
				<th class="py-1 text-right">{m.sales_balance()}</th>
			</tr>
		</thead>
		<tbody>
			{#if data.from}
				<tr class="border-b">
					<td class="py-1 pr-2">{day(data.from)}</td>
					<td class="py-1 pr-2" colspan="3">{m.sales_brought_forward()}</td>
					<td class="py-1 text-right">{formatETB(s.broughtForward)}</td>
				</tr>
			{/if}
			{#each s.lines as e (`${e.kind}-${e.id}`)}
				<tr class="border-b align-top">
					<td class="py-1 pr-2">{day(e.date)}</td>
					<td class="py-1 pr-2">
						{e.kind === 'sale' ? m.sales_purchase_label({ label: e.label }) : e.label}{e.reference
							? ` · ${e.reference}`
							: ''}
					</td>
					<td class="py-1 pr-2 text-right">{e.debit ? formatETB(e.debit) : ''}</td>
					<td class="py-1 pr-2 text-right">{e.credit ? formatETB(e.credit) : ''}</td>
					<td class="py-1 text-right">{formatETB(e.balance)}</td>
				</tr>
			{/each}
		</tbody>
	</table>

	{#if s.open.length}
		<section class="flex flex-col gap-1 text-sm">
			<h2 class="font-semibold">{m.sales_unpaid_purchases()}</h2>
			<table class="w-full border-collapse">
				<tbody>
					{#each s.open as o (o.id)}
						<tr class="border-b">
							<td class="py-1 pr-2">{o.number ?? `#${o.id}`}</td>
							<td class="py-1 pr-2">{m.sales_bought_on({ date: day(o.docDate) })}</td>
							<td class="py-1 pr-2">
								{m.sales_due_date({ date: day(o.dueDate) })}{o.daysOverdue > 0
									? m.sales_days_late_dash({ days: o.daysOverdue })
									: ''}
							</td>
							<td class="py-1 text-right">{formatETB(o.remaining)}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</section>
	{/if}

	<p class="text-sm">
		{m.sales_statement_footer()}
	</p>

	<div class="mt-12 grid grid-cols-2 gap-6 text-sm">
		<div class="border-t pt-1">{m.sales_prepared_by()}</div>
		<div class="border-t pt-1">{m.sales_customer_ack()}</div>
	</div>
</PrintSheet>
