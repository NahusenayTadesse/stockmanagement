<script lang="ts">
	import BigText from '@nahu/admin-kit/components/Table/bigText.svelte';
	import { enhance } from '$app/forms';
	import Printer from '@lucide/svelte/icons/printer';
	import type { ColumnDef } from '@tanstack/table-core';
	import DataTable from '@nahu/admin-kit/components/Table/data-table.svelte';
	import PageHeader from '@nahu/admin-kit/components/PageHeader.svelte';
	import PageSection from '@nahu/admin-kit/components/PageSection.svelte';
	import Notice from '@nahu/admin-kit/components/Notice.svelte';
	import StatCard from '$lib/components/StatCard.svelte';
	import { Badge } from '@nahu/admin-kit/components/ui/badge/index.js';
	import { Button } from '@nahu/admin-kit/components/ui/button/index.js';
	import { Input } from '@nahu/admin-kit/components/ui/input/index.js';
	import { formatETB } from '@nahu/admin-kit/global';
	import { ethiopianDateTime } from '@nahu/admin-kit/tableCells';
	import { cents } from '$lib/money';
	import { moneyCell } from '$lib/table';
	import { m } from '$lib/paraglide/messages.js';

	let { data, form } = $props();
	const s = $derived(data.summary);
	const diff = $derived(
		s.shift.countedCash !== null && s.shift.expectedCash !== null
			? cents(s.shift.countedCash - s.shift.expectedCash)
			: null
	);

	/** Where, and when it opened and closed. */
	const when = $derived(
		[
			s.location,
			m.sales_shift_opened_at({ when: ethiopianDateTime(s.shift.openedAt) }),
			s.shift.closedAt && m.sales_shift_closed_at({ when: ethiopianDateTime(s.shift.closedAt) })
		]
			.filter(Boolean)
			.join(' · ')
	);

	type MethodRow = (typeof s.methods)[number];
	const sum = (key: 'count' | 'moneyIn' | 'moneyOut') =>
		s.methods.reduce((total, row) => total + Number(row[key] ?? 0), 0);

	const methodColumns: ColumnDef<MethodRow>[] = [
		{
			accessorKey: 'method',
			get header() {
				return m.sales_payment_method();
			},
			cell: ({ row }) =>
				`${row.original.method}${row.original.kind === 'cash' ? ` ${m.sales_drawer()}` : ''}`,
			footer: () => m.common_total()
		},
		{
			accessorKey: 'count',
			get header() {
				return m.sales_payments();
			},
			footer: () => sum('count')
		},
		{
			accessorKey: 'moneyIn',
			meta: { align: 'right' },
			get header() {
				return m.sales_in();
			},
			cell: moneyCell,
			footer: () => formatETB(cents(sum('moneyIn')))
		},
		{
			accessorKey: 'moneyOut',
			meta: { align: 'right' },
			get header() {
				return m.sales_out();
			},
			cell: (info) => (info.getValue() ? moneyCell(info) : '—'),
			footer: () => formatETB(cents(sum('moneyOut')))
		}
	];
</script>

<div class="flex flex-col gap-6">
	<PageHeader
		eyebrow={m.sales_till_shift()}
		title="#{s.shift.id} · {s.cashier}"
		tabTitle={m.sales_shift_number({ id: s.shift.id })}
		description={when}
	>
		{#snippet badges()}
			<Badge variant={s.shift.status === 'open' ? 'secondary' : 'default'}
				>{s.shift.status === 'open' ? m.sales_shift_open() : m.sales_shift_closed()}</Badge
			>
		{/snippet}
		{#snippet actions()}
			<Button variant="outline" onclick={() => window.print()}
				><Printer /> {m.common_print()}</Button
			>
		{/snippet}
	</PageHeader>

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

	{#if s.methods.length}
		<DataTable
			data={s.methods}
			columns={methodColumns}
			variant="compact"
			fileName={m.sales_shift_number({ id: s.shift.id })}
		/>
	{:else}
		<p class="rounded-md border px-3 py-6 text-center text-sm text-muted-foreground">
			{m.sales_nothing_taken()}
		</p>
	{/if}

	{#if s.shift.status === 'open'}
		<PageSection
			title={m.sales_close_shift_heading()}
			hint={m.sales_close_shift_intro()}
			class="max-w-md"
		>
			<form method="POST" action="?/close" use:enhance class="flex flex-col gap-3">
				{#if form?.refused}<Notice tone="danger">{form.refused}</Notice>{/if}
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
		</PageSection>
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
			{#if s.shift.note}<p class="text-muted-foreground">
					<BigText text={s.shift.note} max={120} />
				</p>{/if}
		</div>
	{/if}
</div>
