<script lang="ts">
	import { ethiopianDay } from '$lib/format';
	import DatePresets from '$lib/components/filters/DatePresets.svelte';
	import { resolve } from '$app/paths';
	import Plus from '@lucide/svelte/icons/plus';
	import DataTable from '@nahu/admin-kit/components/Table/data-table.svelte';
	import StatCard from '$lib/components/StatCard.svelte';
	import type { Stat } from '@nahu/admin-kit/components/reports/types';
	import * as Card from '@nahu/admin-kit/components/ui/card/index.js';
	import { Button } from '@nahu/admin-kit/components/ui/button/index.js';
	import { Input } from '@nahu/admin-kit/components/ui/input/index.js';
	import PageHeader from '@nahu/admin-kit/components/PageHeader.svelte';
	import type { ColumnDef } from '@tanstack/table-core';
	import FilterBar from '$lib/components/filters/FilterBar.svelte';
	import FilterField from '$lib/components/filters/FilterField.svelte';
	import FilterSelect from '$lib/components/filters/FilterSelect.svelte';
	import DateRangeFields from '$lib/components/filters/DateRangeFields.svelte';
	import DialogComp from '@nahu/admin-kit/formComponents/DialogComp.svelte';
	import LoadingBtn from '@nahu/admin-kit/formComponents/LoadingBtn.svelte';
	import Errors from '@nahu/admin-kit/formComponents/Errors.svelte';
	import { createForm } from '@nahu/admin-kit/forms/createForm';
	import { moneyCell } from '$lib/table';
	import TransactionFields from '$lib/components/TransactionFields.svelte';
	import { PURPOSE_CHOICES, transactionAdd } from '$lib/schemas/transactions';
	import { columns } from './columns';
	import { m } from '$lib/paraglide/messages.js';

	let { data } = $props();
	let open = $state(false);

	// svelte-ignore state_referenced_locally
	const { form, errors, enhance, delayed, allErrors } = createForm(data.form, transactionAdd);

	const f = $derived(data.filters);
	const ethiopian = ethiopianDay;

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

	type MethodRow = (typeof data.byMethod)[number] & { net: number };
	const byMethod = $derived(data.byMethod.map((r) => ({ ...r, net: r.moneyIn - r.moneyOut })));
	const methodColumns: ColumnDef<MethodRow>[] = [
		{
			accessorKey: 'method',
			get header() {
				return m.sales_method();
			}
		},
		{
			accessorKey: 'moneyIn',
			meta: { align: 'right' },
			get header() {
				return m.sales_in();
			},
			cell: moneyCell
		},
		{
			accessorKey: 'moneyOut',
			meta: { align: 'right' },
			get header() {
				return m.sales_out();
			},
			cell: moneyCell
		},
		{
			accessorKey: 'net',
			meta: { align: 'right' },
			get header() {
				return m.sales_net();
			},
			cell: moneyCell
		}
	];
</script>

<div class="flex flex-col gap-6">
	<PageHeader
		title={m.sales_transactions_title()}
		description={m.sales_every_birr({ from: ethiopian(f.from), to: ethiopian(f.to) })}
	>
		{#snippet actions()}
			{#if data.canManage}
				<DialogComp
					bind:open
					title={m.sales_record_transaction()}
					variant="default"
					IconComp={Plus}
				>
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
		{/snippet}
	</PageHeader>

	<FilterBar submitLabel={m.sales_apply()}>
		<DateRangeFields
			from={f.from}
			to={f.to}
			fromLabel={m.sales_from()}
			toLabel={m.sales_to_date()}
		/>
		<FilterSelect
			name="direction"
			label={m.sales_money()}
			value={f.direction}
			anyLabel={m.sales_in_and_out()}
			options={[
				{ value: 'in', name: m.sales_in() },
				{ value: 'out', name: m.sales_out() }
			]}
		/>
		<FilterSelect
			name="method"
			label={m.sales_method()}
			value={f.methodId}
			anyLabel={m.sales_any_method()}
			anyValue={0}
			options={data.methods.slice(1)}
		/>
		<FilterSelect
			name="purpose"
			label={m.sales_for()}
			value={f.purpose}
			anyLabel={m.sales_anything()}
			options={PURPOSE_CHOICES}
		/>
		<FilterSelect
			name="status"
			label={m.common_status()}
			value={f.status}
			anyLabel={m.sales_recorded_and_verified()}
			options={[
				{ value: 'recorded', name: m.sales_not_verified() },
				{ value: 'verified', name: m.sales_verified() },
				{ value: 'void', name: m.sales_voided() }
			]}
		/>
		<FilterSelect
			name="branch"
			label={m.common_branch()}
			value={f.branchId}
			anyLabel={m.sales_all_branches()}
			anyValue={0}
			options={data.branches.slice(1)}
		/>
		<FilterField label={m.common_search()} for="q">
			<Input id="q" name="q" value={f.q} placeholder={m.sales_search_placeholder()} />
		</FilterField>
		{#snippet after()}
			<DatePresets presets={data.presets} from={f.from} to={f.to} href={presetHref}>
				<Button href={resolve('/dashboard/transactions')} size="sm" variant="ghost"
					>{m.sales_reset()}</Button
				>
			</DatePresets>
		{/snippet}
	</FilterBar>

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
				<DataTable
					data={byMethod}
					columns={methodColumns}
					variant="compact"
					fileName={m.sales_by_payment_method()}
				/>
			</Card.Content>
		</Card.Root>
	{/if}

	<DataTable
		data={data.rows}
		{columns}
		variant="list"
		fileName={m.sales_tx_file_range({ from: f.from, to: f.to })}
	/>
</div>
