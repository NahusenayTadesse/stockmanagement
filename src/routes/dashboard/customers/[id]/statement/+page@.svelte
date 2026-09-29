<script lang="ts">
	import PrintSheet from '@nahu/admin-kit/components/PrintSheet.svelte';
	import { formatETB, formatEthiopianDate } from '@nahu/admin-kit/global';
	import { fileUrl } from '@nahu/admin-kit/files';

	let { data } = $props();

	const c = $derived(data.customer);
	const s = $derived(data.statement);
	const day = (d: string) => formatEthiopianDate(new Date(`${d}T12:00:00+03:00`));
</script>

<svelte:head>
	<title>Statement · {c.name}</title>
</svelte:head>

<PrintSheet
	branch={{ name: data.org.name, address: data.org.address, phone: data.org.phone }}
	fallbackName={data.org.name}
>
	<section class="flex items-start justify-between gap-6">
		<div class="flex flex-col gap-1">
			<h1 class="text-xl font-bold">Statement of account</h1>
			<p>As of {day(data.today)} ({data.today})</p>
			{#if data.org.tin}<p class="text-sm">TIN {data.org.tin}</p>{/if}
		</div>
		{#if data.org.logo}
			<img
				src={fileUrl(data.org.logo)}
				alt="{data.org.name} logo"
				class="h-20 max-w-48 object-contain"
			/>
		{/if}
	</section>

	<dl class="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
		<dt class="font-semibold">Customer</dt>
		<dd>
			{c.name}{c.phone ? `, ${c.phone}` : ''}{c.tin ? `, TIN ${c.tin}` : ''}{c.address
				? `, ${c.address}`
				: ''}
		</dd>
		<dt class="font-semibold">Terms</dt>
		<dd>
			{c.creditLimit === 0
				? 'Cash only'
				: `${c.creditDays} days to pay${c.creditLimit !== null ? `, limit ${formatETB(c.creditLimit)}` : ''}`}
		</dd>
		<dt class="font-semibold">Balance due</dt>
		<dd class="font-bold">
			{s.balance < 0 ? `${formatETB(-s.balance)} in your favour` : formatETB(s.balance)}{s.overdue >
			0
				? ` — ${formatETB(s.overdue)} overdue`
				: ''}
		</dd>
	</dl>

	<table class="w-full border-collapse text-sm">
		<thead>
			<tr class="border-b-2 text-left">
				<th class="py-1 pr-2">Date</th>
				<th class="py-1 pr-2">Details</th>
				<th class="py-1 pr-2 text-right">Purchases</th>
				<th class="py-1 pr-2 text-right">Payments</th>
				<th class="py-1 text-right">Balance</th>
			</tr>
		</thead>
		<tbody>
			{#if data.from}
				<tr class="border-b">
					<td class="py-1 pr-2">{day(data.from)}</td>
					<td class="py-1 pr-2" colspan="3">Balance brought forward</td>
					<td class="py-1 text-right">{formatETB(s.broughtForward)}</td>
				</tr>
			{/if}
			{#each s.lines as e (`${e.kind}-${e.id}`)}
				<tr class="border-b align-top">
					<td class="py-1 pr-2">{day(e.date)}</td>
					<td class="py-1 pr-2">
						{e.kind === 'sale' ? `Purchase ${e.label}` : e.label}{e.reference
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
			<h2 class="font-semibold">Unpaid purchases</h2>
			<table class="w-full border-collapse">
				<tbody>
					{#each s.open as o (o.id)}
						<tr class="border-b">
							<td class="py-1 pr-2">{o.number ?? `#${o.id}`}</td>
							<td class="py-1 pr-2">bought {day(o.docDate)}</td>
							<td class="py-1 pr-2">
								due {day(o.dueDate)}{o.daysOverdue > 0 ? ` — ${o.daysOverdue} days late` : ''}
							</td>
							<td class="py-1 text-right">{formatETB(o.remaining)}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</section>
	{/if}

	<p class="text-sm">
		Please quote the purchase numbers when you pay. Thank you for your business.
	</p>

	<div class="mt-12 grid grid-cols-2 gap-6 text-sm">
		<div class="border-t pt-1">Prepared by</div>
		<div class="border-t pt-1">Customer's acknowledgement</div>
	</div>
</PrintSheet>
