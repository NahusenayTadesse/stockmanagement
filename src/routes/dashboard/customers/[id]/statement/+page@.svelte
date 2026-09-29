<script lang="ts">
	import DataTable from '@nahu/admin-kit/components/Table/data-table.svelte';
	import type { ColumnDef } from '@tanstack/table-core';
	import { column, moneyCell, moneyColumn, RIGHT } from '$lib/table';
	import { ethiopianDay } from '$lib/format';
	import PrintSheet from '@nahu/admin-kit/components/PrintSheet.svelte';
	import { formatETB } from '@nahu/admin-kit/global';
	import { fileUrl } from '@nahu/admin-kit/files';
	import { m } from '$lib/paraglide/messages.js';

	let { data } = $props();

	const c = $derived(data.customer);
	const s = $derived(data.statement);
	const day = ethiopianDay;

	/** A line of the account, or what was owed when the period began (`kind: 'forward'`). */
	type Entry = Omit<(typeof s.lines)[number], 'kind'> & {
		kind: (typeof s.lines)[number]['kind'] | 'forward';
	};
	const entries = $derived<Entry[]>([
		...(data.from
			? [
					{
						kind: 'forward' as const,
						id: 0,
						date: data.from,
						label: m.sales_brought_forward(),
						reference: null,
						debit: 0,
						credit: 0,
						balance: s.broughtForward
					}
				]
			: []),
		...s.lines
	]);
	const columns: ColumnDef<Entry>[] = [
		column<Entry>('date', m.common_date, ({ row: { original: e } }) => day(e.date)),
		column<Entry>('label', m.sales_details, ({ row: { original: e } }) =>
			[e.kind === 'sale' ? m.sales_purchase_label({ label: e.label }) : e.label, e.reference]
				.filter(Boolean)
				.join(' · ')
		),
		column<Entry>(
			'debit',
			m.sales_purchases,
			({ row: { original: e } }) => (e.debit ? formatETB(e.debit) : ''),
			RIGHT
		),
		column<Entry>(
			'credit',
			m.sales_payments,
			({ row: { original: e } }) => (e.credit ? formatETB(e.credit) : ''),
			RIGHT
		),
		moneyColumn<Entry>('balance', m.sales_balance)
	];

	type Open = (typeof s.open)[number];
	/** Each unpaid purchase says what it is in its cells, so the list needs no header row. */
	const openColumns: ColumnDef<Open>[] = [
		{ id: 'number', cell: ({ row: { original: o } }) => o.number ?? `#${o.id}` },
		{
			id: 'bought',
			cell: ({ row: { original: o } }) => m.sales_bought_on({ date: day(o.docDate) })
		},
		{
			id: 'due',
			cell: ({ row: { original: o } }) =>
				m.sales_due_date({ date: day(o.dueDate) }) +
				(o.daysOverdue > 0 ? m.sales_days_late_dash({ days: o.daysOverdue }) : '')
		},
		{ accessorKey: 'remaining', cell: moneyCell, meta: { align: 'right' } }
	];
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

	<DataTable variant="print" data={entries} {columns} />

	{#if s.open.length}
		<section class="flex flex-col gap-1 text-sm">
			<h2 class="font-semibold">{m.sales_unpaid_purchases()}</h2>
			<DataTable variant="print" data={s.open} columns={openColumns} />
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
