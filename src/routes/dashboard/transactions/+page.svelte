<script lang="ts">
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
			label: 'Money in',
			value: data.totals.moneyIn,
			format: 'money',
			group: 'money',
			tone: 'positive'
		},
		{
			key: 'out',
			label: 'Money out',
			value: data.totals.moneyOut,
			format: 'money',
			group: 'money',
			tone: 'negative'
		},
		{
			key: 'net',
			label: 'Net',
			value: data.totals.net,
			format: 'money',
			group: 'money',
			tone: data.totals.net >= 0 ? 'positive' : 'negative'
		},
		{
			key: 'unverified',
			label: 'Not yet verified',
			value: data.totals.unverified,
			format: 'count',
			group: 'money',
			hint: `of ${data.totals.count} transactions`,
			tone: data.totals.unverified ? 'warning' : 'neutral'
		}
	]);

	const select = 'h-9 rounded-md border bg-background px-2 text-sm';
</script>

<svelte:head>
	<title>Transactions</title>
</svelte:head>

<div class="flex flex-col gap-6">
	<div class="flex flex-wrap items-center justify-between gap-2">
		<div>
			<h1 class="text-2xl font-semibold">Transactions</h1>
			<p class="text-muted-foreground">
				Every birr in and out: {ethiopian(f.from)} – {ethiopian(f.to)}.
			</p>
		</div>
		{#if data.canManage}
			<DialogComp bind:open title="Record a transaction" variant="default" IconComp={Plus}>
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
						withFile
					/>
					<Button type="submit" form="add">
						{#if $delayed}<LoadingBtn name="Saving" />{:else}Record{/if}
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
					<Label for="from">From</Label>
					<Input id="from" name="from" type="date" value={f.from} />
				</div>
				<div class="flex flex-col gap-1">
					<Label for="to">To</Label>
					<Input id="to" name="to" type="date" value={f.to} />
				</div>
				<div class="flex flex-col gap-1">
					<Label for="direction">Money</Label>
					<select id="direction" name="direction" class={select} value={f.direction}>
						<option value="">In and out</option>
						<option value="in">In</option>
						<option value="out">Out</option>
					</select>
				</div>
				<div class="flex flex-col gap-1">
					<Label for="method">Method</Label>
					<select id="method" name="method" class={select} value={String(f.methodId)}>
						<option value="0">Any method</option>
						{#each data.methods.slice(1) as m (m.value)}<option value={String(m.value)}
								>{m.name}</option
							>{/each}
					</select>
				</div>
				<div class="flex flex-col gap-1">
					<Label for="purpose">For</Label>
					<select id="purpose" name="purpose" class={select} value={f.purpose}>
						<option value="">Anything</option>
						{#each PURPOSE_CHOICES as p (p.value)}<option value={p.value}>{p.name}</option>{/each}
					</select>
				</div>
				<div class="flex flex-col gap-1">
					<Label for="status">Status</Label>
					<select id="status" name="status" class={select} value={f.status}>
						<option value="">Recorded and verified</option>
						<option value="recorded">Not yet verified</option>
						<option value="verified">Verified</option>
						<option value="void">Voided</option>
					</select>
				</div>
				<div class="flex flex-col gap-1">
					<Label for="branch">Branch</Label>
					<select id="branch" name="branch" class={select} value={String(f.branchId)}>
						<option value="0">All branches</option>
						{#each data.branches.slice(1) as b (b.value)}<option value={String(b.value)}
								>{b.name}</option
							>{/each}
					</select>
				</div>
				<div class="flex flex-col gap-1">
					<Label for="q">Search</Label>
					<Input id="q" name="q" value={f.q} placeholder="Name, reference, receipt no." />
				</div>
				<div class="flex gap-2 sm:col-span-2 lg:col-span-4">
					<Button type="submit">Apply</Button>
					<Button href={resolve('/dashboard/transactions')} variant="ghost">Reset</Button>
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
				<Card.Title>By payment method</Card.Title>
				<Card.Description
					>What should have gone through each till, wallet and account.</Card.Description
				>
			</Card.Header>
			<Card.Content>
				<table class="w-full text-sm">
					<thead>
						<tr class="border-b text-left text-muted-foreground">
							<th class="py-1">Method</th>
							<th class="py-1 text-right">In</th>
							<th class="py-1 text-right">Out</th>
							<th class="py-1 text-right">Net</th>
						</tr>
					</thead>
					<tbody>
						{#each data.byMethod as m (m.method)}
							<tr class="border-b last:border-0">
								<td class="py-1">{m.method}</td>
								<td class="py-1 text-right">{formatETB(m.moneyIn)}</td>
								<td class="py-1 text-right">{formatETB(m.moneyOut)}</td>
								<td class="py-1 text-right font-medium">{formatETB(m.moneyIn - m.moneyOut)}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</Card.Content>
		</Card.Root>
	{/if}

	<DataTable data={data.rows} {columns} fileName="Transactions {f.from} to {f.to}" />
</div>
