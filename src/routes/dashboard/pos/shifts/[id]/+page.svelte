<script lang="ts">
	import { enhance } from '$app/forms';
	import Printer from '@lucide/svelte/icons/printer';
	import StatCard from '@nahu/admin-kit/components/reports/StatCard.svelte';
	import { Badge } from '@nahu/admin-kit/components/ui/badge/index.js';
	import { Button } from '@nahu/admin-kit/components/ui/button/index.js';
	import { Input } from '@nahu/admin-kit/components/ui/input/index.js';
	import { formatETB } from '@nahu/admin-kit/global';
	import { ethiopianDateTime } from '@nahu/admin-kit/tableCells';
	import { m } from '$lib/paraglide/messages.js';

	let { data, form } = $props();
	const s = $derived(data.summary);
	const diff = $derived(
		s.shift.countedCash !== null && s.shift.expectedCash !== null
			? Math.round((s.shift.countedCash - s.shift.expectedCash) * 100) / 100
			: null
	);
</script>

<svelte:head>
	<title>{m.sales_shift_number({ id: s.shift.id })}</title>
</svelte:head>

<div class="flex flex-col gap-6">
	<div class="flex flex-wrap items-start justify-between gap-2">
		<div>
			<p class="text-sm text-muted-foreground">{m.sales_till_shift()}</p>
			<h1 class="flex items-center gap-2 text-2xl font-semibold">
				#{s.shift.id} · {s.cashier}
				<Badge variant={s.shift.status === 'open' ? 'secondary' : 'default'}
					>{s.shift.status === 'open' ? m.sales_shift_open() : m.sales_shift_closed()}</Badge
				>
			</h1>
			<p class="text-muted-foreground">
				{s.location} · {m.sales_shift_opened_at({ when: ethiopianDateTime(s.shift.openedAt) })}{s
					.shift.closedAt
					? ` · ${m.sales_shift_closed_at({ when: ethiopianDateTime(s.shift.closedAt) })}`
					: ''}
			</p>
		</div>
		<Button variant="outline" onclick={() => window.print()}><Printer /> {m.common_print()}</Button>
	</div>

	<div class="grid gap-4 sm:grid-cols-3">
		<StatCard
			stat={{
				key: 'sales',
				label: m.sales_sales(),
				value: s.sales,
				format: 'count',
				group: 'shift'
			}}
		/>
		<StatCard
			stat={{
				key: 'taken',
				label: m.sales_taken_all(),
				value: s.taken,
				format: 'money',
				group: 'shift',
				tone: 'positive'
			}}
		/>
		<StatCard
			stat={{
				key: 'cash',
				label: m.sales_drawer_should_hold(),
				value: s.expectedCash,
				format: 'money',
				group: 'shift',
				hint: m.sales_drawer_hint({ float: formatETB(s.shift.openingFloat) })
			}}
		/>
	</div>

	<div class="overflow-x-auto rounded-md border">
		<table class="w-full text-sm">
			<thead class="bg-muted/50 text-left">
				<tr>
					<th class="px-3 py-2">{m.sales_payment_method()}</th>
					<th class="px-3 py-2 text-right">{m.sales_payments()}</th>
					<th class="px-3 py-2 text-right">{m.sales_in()}</th>
					<th class="px-3 py-2 text-right">{m.sales_out()}</th>
				</tr>
			</thead>
			<tbody>
				{#each s.methods as row (row.method)}
					<tr class="border-t">
						<td class="px-3 py-2"
							>{row.method}{row.kind === 'cash' ? ` ${m.sales_drawer()}` : ''}</td
						>
						<td class="px-3 py-2 text-right">{row.count}</td>
						<td class="px-3 py-2 text-right">{formatETB(row.moneyIn)}</td>
						<td class="px-3 py-2 text-right">{row.moneyOut ? formatETB(row.moneyOut) : '—'}</td>
					</tr>
				{:else}
					<tr
						><td colspan="4" class="px-3 py-6 text-center text-muted-foreground"
							>{m.sales_nothing_taken()}</td
						></tr
					>
				{/each}
			</tbody>
		</table>
	</div>

	{#if s.shift.status === 'open'}
		<form method="POST" action="?/close" use:enhance class="flex max-w-md flex-col gap-3">
			<h2 class="text-lg font-semibold">{m.sales_close_shift_heading()}</h2>
			<p class="text-sm text-muted-foreground">{m.sales_close_shift_intro()}</p>
			{#if form?.error}<p class="text-sm text-destructive">{form.error}</p>{/if}
			<label class="flex flex-col gap-1 text-sm">
				{m.sales_cash_counted_etb()}
				<Input name="countedCash" type="number" min="0" step="0.01" required />
			</label>
			<label class="flex flex-col gap-1 text-sm">
				{m.sales_note_optional()}
				<Input name="note" placeholder={m.sales_over_short_placeholder()} />
			</label>
			<Button type="submit">{m.sales_count_and_close()}</Button>
		</form>
	{:else}
		<div class="rounded-md border p-4 text-sm">
			<p>
				{m.sales_expected_counted({
					expected: formatETB(s.shift.expectedCash),
					counted: formatETB(s.shift.countedCash)
				})}
			</p>
			<p class="text-lg font-semibold {diff ? 'text-destructive' : ''}">
				{diff === 0
					? m.sales_exact_cap()
					: diff! > 0
						? m.sales_over_by({ amount: formatETB(diff) })
						: m.sales_short_by({ amount: formatETB(-diff!) })}
			</p>
			{#if s.shift.note}<p class="text-muted-foreground">{s.shift.note}</p>{/if}
		</div>
	{/if}
</div>
