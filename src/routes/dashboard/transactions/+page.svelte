<script lang="ts">
	import DateInput from '@nahu/admin-kit/formComponents/DateInput.svelte';
	import { resolve } from '$app/paths';
	import Plus from '@lucide/svelte/icons/plus';
	import DataTable from '@nahu/admin-kit/components/Table/data-table.svelte';
	import StatCard from '@nahu/admin-kit/components/reports/StatCard.svelte';
	import type { Stat } from '@nahu/admin-kit/components/reports/types';
	import * as Card from '@nahu/admin-kit/components/ui/card/index.js';
	import { Button } from '@nahu/admin-kit/components/ui/button/index.js';
	import { Input } from '@nahu/admin-kit/components/ui/input/index.js';
	import { Label } from '@nahu/admin-kit/components/ui/label/index.js';
	import DialogComp from '@nahu/admin-kit/formComponents/DialogComp.svelte';
	import LoadingBtn from '@nahu/admin-kit/formComponents/LoadingBtn.svelte';
	import Errors from '@nahu/admin-kit/formComponents/Errors.svelte';
	import { createForm } from '@nahu/admin-kit/forms/createForm';
	import { formatETB, formatEthiopianDate } from '@nahu/admin-kit/global';
	import TransactionFields from '$lib/components/TransactionFields.svelte';
	import { PURPOSE_CHOICES, transactionAdd } from '$lib/schemas/transactions';
	import { columns } from './columns';
	import { m } from '$lib/paraglide/messages.js';

	let { data } = $props();
	let open = $state(false);

	// svelte-ignore state_referenced_locally
	const { form, errors, enhance, delayed, allErrors } = createForm(data.form, transactionAdd);

	const f = $derived(data.filters);
	const ethiopian = (day: string) => formatEthiopianDate(new Date(`${day}T12:00:00+03:00`));

	/** A preset keeps the other filters and only swaps the dates. */
	function presetHref(from: string, to: string) {
		const params = new URLSearchParams({
			from,
			to,
			...(f.direction && { direction: f.direction }),
			...(f.status && { status: f.status }),
			...(f.purpose && { purpose: f.purpose }),
			...(f.methodId && { method: String(f.methodId) }),
			...(f.branchId && { branch: String(f.branchId) }),
			...(f.q && { q: f.q })
		});
		return `${resolve('/dashboard/transactions')}?${params}`;
	}

	const tiles = $derived<Stat[]>([
		{
			key: 'in',
			label: m.sales_money_in(),
			value: data.totals.moneyIn,
			format: 'money',
			group: 'money',
			tone: 'positive'
		},
		{
			key: 'out',
			label: m.sales_money_out(),
			value: data.totals.moneyOut,
			format: 'money',
			group: 'money',
			tone: 'negative'
		},
		{
			key: 'net',
			label: m.sales_net(),
			value: data.totals.net,
			format: 'money',
			group: 'money',
			tone: data.totals.net >= 0 ? 'positive' : 'negative'
		},
		{
			key: 'unverified',
			label: m.sales_not_verified(),
			value: data.totals.unverified,
			format: 'count',
			group: 'money',
			hint: m.sales_of_transactions({ count: data.totals.count }),
			tone: data.totals.unverified ? 'warning' : 'neutral'
		}
	]);

	const select = 'h-9 rounded-md border bg-background px-2 text-sm';
</script>

<svelte:head>
	<title>{m.sales_transactions_title()}</title>
</svelte:head>

<div class="flex flex-col gap-6">
	<div class="flex flex-wrap items-center justify-between gap-2">
		<div>
			<h1 class="text-2xl font-semibold">{m.sales_transactions_title()}</h1>
			<p class="text-muted-foreground">
				{m.sales_every_birr({ from: ethiopian(f.from), to: ethiopian(f.to) })}
			</p>
		</div>
		{#if data.canManage}
			<DialogComp bind:open title={m.sales_record_transaction()} variant="default" IconComp={Plus}>
				<form
					method="POST"
					action="?/add"
					enctype="multipart/form-data"
					use:enhance
					id="add"
					class="flex flex-col gap-4"
				>
					<Errors allErrors={$allErrors} />
					<TransactionFields
						{form}
						{errors}
						methods={data.methods}
						branches={data.branches}
						suppliers={data.suppliers}
						customers={data.customers}
						withFile
					/>
					<Button type="submit" form="add">
						{#if $delayed}<LoadingBtn name={m.common_saving()} />{:else}{m.sales_record()}{/if}
					</Button>
				</form>
			</DialogComp>
		{/if}
	</div>

	<Card.Root>
		<Card.Content class="flex flex-col gap-4 pt-6">
			<div class="flex flex-wrap gap-2">
				{#each data.presets as p (p.key)}
					<Button
						href={presetHref(p.from, p.to)}
						size="sm"
						variant={p.from === f.from && p.to === f.to ? 'default' : 'outline'}>{p.label}</Button
					>
				{/each}
			</div>
			<form method="GET" class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
				<div class="flex flex-col gap-1">
					<Label for="from">{m.sales_from()}</Label>
					<DateInput id="from" name="from" value={f.from} />
				</div>
				<div class="flex flex-col gap-1">
					<Label for="to">{m.sales_to_date()}</Label>
					<DateInput id="to" name="to" value={f.to} />
				</div>
				<div class="flex flex-col gap-1">
					<Label for="direction">{m.sales_money()}</Label>
					<select id="direction" name="direction" class={select} value={f.direction}>
						<option value="">{m.sales_in_and_out()}</option>
						<option value="in">{m.sales_in()}</option>
						<option value="out">{m.sales_out()}</option>
					</select>
				</div>
				<div class="flex flex-col gap-1">
					<Label for="method">{m.sales_method()}</Label>
					<select id="method" name="method" class={select} value={String(f.methodId)}>
						<option value="0">{m.sales_any_method()}</option>
						{#each data.methods.slice(1) as method (method.value)}<option
								value={String(method.value)}>{method.name}</option
							>{/each}
					</select>
				</div>
				<div class="flex flex-col gap-1">
					<Label for="purpose">{m.sales_for()}</Label>
					<select id="purpose" name="purpose" class={select} value={f.purpose}>
						<option value="">{m.sales_anything()}</option>
						{#each PURPOSE_CHOICES as p (p.value)}<option value={p.value}>{p.name}</option>{/each}
					</select>
				</div>
				<div class="flex flex-col gap-1">
					<Label for="status">{m.common_status()}</Label>
					<select id="status" name="status" class={select} value={f.status}>
						<option value="">{m.sales_recorded_and_verified()}</option>
						<option value="recorded">{m.sales_not_verified()}</option>
						<option value="verified">{m.sales_verified()}</option>
						<option value="void">{m.sales_voided()}</option>
					</select>
				</div>
				<div class="flex flex-col gap-1">
					<Label for="branch">{m.common_branch()}</Label>
					<select id="branch" name="branch" class={select} value={String(f.branchId)}>
						<option value="0">{m.sales_all_branches()}</option>
						{#each data.branches.slice(1) as b (b.value)}<option value={String(b.value)}
								>{b.name}</option
							>{/each}
					</select>
				</div>
				<div class="flex flex-col gap-1">
					<Label for="q">{m.common_search()}</Label>
					<Input id="q" name="q" value={f.q} placeholder={m.sales_search_placeholder()} />
				</div>
				<div class="flex gap-2 sm:col-span-2 lg:col-span-4">
					<Button type="submit">{m.sales_apply()}</Button>
					<Button href={resolve('/dashboard/transactions')} variant="ghost"
						>{m.sales_reset()}</Button
					>
				</div>
			</form>
		</Card.Content>
	</Card.Root>

	<div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
		{#each tiles as stat (stat.key)}<StatCard {stat} />{/each}
	</div>

	{#if data.byMethod.length}
		<Card.Root>
			<Card.Header>
				<Card.Title>{m.sales_by_payment_method()}</Card.Title>
				<Card.Description>{m.sales_by_method_intro()}</Card.Description>
			</Card.Header>
			<Card.Content>
				<table class="w-full text-sm">
					<thead>
						<tr class="border-b text-left text-muted-foreground">
							<th class="py-1">{m.sales_method()}</th>
							<th class="py-1 text-right">{m.sales_in()}</th>
							<th class="py-1 text-right">{m.sales_out()}</th>
							<th class="py-1 text-right">{m.sales_net()}</th>
						</tr>
					</thead>
					<tbody>
						{#each data.byMethod as row (row.method)}
							<tr class="border-b last:border-0">
								<td class="py-1">{row.method}</td>
								<td class="py-1 text-right">{formatETB(row.moneyIn)}</td>
								<td class="py-1 text-right">{formatETB(row.moneyOut)}</td>
								<td class="py-1 text-right font-medium">{formatETB(row.moneyIn - row.moneyOut)}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</Card.Content>
		</Card.Root>
	{/if}

	<DataTable
		data={data.rows}
		{columns}
		fileName={m.sales_tx_file_range({ from: f.from, to: f.to })}
	/>
</div>
