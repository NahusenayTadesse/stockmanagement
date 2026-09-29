<script lang="ts">
	import { enhance } from '$app/forms';
	import Printer from '@lucide/svelte/icons/printer';
	import StatCard from '@nahu/admin-kit/components/reports/StatCard.svelte';
	import { Badge } from '@nahu/admin-kit/components/ui/badge/index.js';
	import { Button } from '@nahu/admin-kit/components/ui/button/index.js';
	import { Input } from '@nahu/admin-kit/components/ui/input/index.js';
	import { formatETB } from '@nahu/admin-kit/global';
	import { ethiopianDateTime } from '@nahu/admin-kit/tableCells';

	let { data, form } = $props();
	const s = $derived(data.summary);
	const diff = $derived(
		s.shift.countedCash !== null && s.shift.expectedCash !== null
			? Math.round((s.shift.countedCash - s.shift.expectedCash) * 100) / 100
			: null
	);
</script>

<svelte:head>
	<title>Shift #{s.shift.id}</title>
</svelte:head>

<div class="flex flex-col gap-6">
	<div class="flex flex-wrap items-start justify-between gap-2">
		<div>
			<p class="text-sm text-muted-foreground">Till shift</p>
			<h1 class="flex items-center gap-2 text-2xl font-semibold">
				#{s.shift.id} · {s.cashier}
				<Badge variant={s.shift.status === 'open' ? 'secondary' : 'default'}>{s.shift.status}</Badge
				>
			</h1>
			<p class="text-muted-foreground">
				{s.location} · opened {ethiopianDateTime(s.shift.openedAt)}{s.shift.closedAt
					? ` · closed ${ethiopianDateTime(s.shift.closedAt)}`
					: ''}
			</p>
		</div>
		<Button variant="outline" onclick={() => window.print()}><Printer /> Print</Button>
	</div>

	<div class="grid gap-4 sm:grid-cols-3">
		<StatCard
			stat={{ key: 'sales', label: 'Sales', value: s.sales, format: 'count', group: 'shift' }}
		/>
		<StatCard
			stat={{
				key: 'taken',
				label: 'Taken, all methods',
				value: s.taken,
				format: 'money',
				group: 'shift',
				tone: 'positive'
			}}
		/>
		<StatCard
			stat={{
				key: 'cash',
				label: 'Cash the drawer should hold',
				value: s.expectedCash,
				format: 'money',
				group: 'shift',
				hint: `${formatETB(s.shift.openingFloat)} float + cash taken − cash paid out`
			}}
		/>
	</div>

	<div class="overflow-x-auto rounded-md border">
		<table class="w-full text-sm">
			<thead class="bg-muted/50 text-left">
				<tr>
					<th class="px-3 py-2">Payment method</th>
					<th class="px-3 py-2 text-right">Payments</th>
					<th class="px-3 py-2 text-right">In</th>
					<th class="px-3 py-2 text-right">Out</th>
				</tr>
			</thead>
			<tbody>
				{#each s.methods as m (m.method)}
					<tr class="border-t">
						<td class="px-3 py-2">{m.method}{m.kind === 'cash' ? ' (drawer)' : ''}</td>
						<td class="px-3 py-2 text-right">{m.count}</td>
						<td class="px-3 py-2 text-right">{formatETB(m.moneyIn)}</td>
						<td class="px-3 py-2 text-right">{m.moneyOut ? formatETB(m.moneyOut) : '—'}</td>
					</tr>
				{:else}
					<tr
						><td colspan="4" class="px-3 py-6 text-center text-muted-foreground"
							>Nothing taken yet.</td
						></tr
					>
				{/each}
			</tbody>
		</table>
	</div>

	{#if s.shift.status === 'open'}
		<form method="POST" action="?/close" use:enhance class="flex max-w-md flex-col gap-3">
			<h2 class="text-lg font-semibold">Close the shift</h2>
			<p class="text-sm text-muted-foreground">
				Count the cash in the drawer — the float included — and enter it. The difference is
				recorded.
			</p>
			{#if form?.error}<p class="text-sm text-destructive">{form.error}</p>{/if}
			<label class="flex flex-col gap-1 text-sm">
				Cash counted (ETB)
				<Input name="countedCash" type="number" min="0" step="0.01" required />
			</label>
			<label class="flex flex-col gap-1 text-sm">
				Note (optional)
				<Input name="note" placeholder="Why it is over or short, if it is" />
			</label>
			<Button type="submit">Count and close</Button>
		</form>
	{:else}
		<div class="rounded-md border p-4 text-sm">
			<p>Expected {formatETB(s.shift.expectedCash)} · counted {formatETB(s.shift.countedCash)}</p>
			<p class="text-lg font-semibold {diff ? 'text-destructive' : ''}">
				{diff === 0
					? 'Exact'
					: diff! > 0
						? `Over by ${formatETB(diff)}`
						: `Short by ${formatETB(-diff!)}`}
			</p>
			{#if s.shift.note}<p class="text-muted-foreground">{s.shift.note}</p>{/if}
		</div>
	{/if}
</div>
