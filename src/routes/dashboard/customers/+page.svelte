<script lang="ts">
	import { resolve } from '$app/paths';
	import Plus from '@lucide/svelte/icons/plus';
	import Clock from '@lucide/svelte/icons/clock';
	import DataTable from '@nahu/admin-kit/components/Table/data-table.svelte';
	import StatCard from '@nahu/admin-kit/components/reports/StatCard.svelte';
	import type { Stat } from '@nahu/admin-kit/components/reports/types';
	import { Button } from '@nahu/admin-kit/components/ui/button/index.js';
	import DialogComp from '@nahu/admin-kit/formComponents/DialogComp.svelte';
	import LoadingBtn from '@nahu/admin-kit/formComponents/LoadingBtn.svelte';
	import Errors from '@nahu/admin-kit/formComponents/Errors.svelte';
	import { createForm } from '@nahu/admin-kit/forms/createForm';
	import CustomerFields from '$lib/components/CustomerFields.svelte';
	import { customerSchema } from '$lib/schemas/customers';
	import { columns } from './columns';
	import { m } from '$lib/paraglide/messages.js';

	let { data } = $props();
	let open = $state(false);

	// svelte-ignore state_referenced_locally
	const { form, errors, enhance, delayed, allErrors } = createForm(data.form, customerSchema, {
		resetForm: true,
		onUpdated({ form }) {
			if (form.message?.type === 'success') open = false;
		}
	});

	const owed = $derived(data.customers.reduce((sum, c) => sum + Math.max(0, c.owed), 0));
	const overdue = $derived(data.customers.reduce((sum, c) => sum + c.overdue, 0));
	const tiles = $derived<Stat[]>([
		{
			key: 'count',
			label: m.sales_customers_on_list(),
			value: data.customers.filter((c) => c.status).length,
			format: 'count',
			group: 'customers'
		},
		{
			key: 'owed',
			label: m.sales_owed_to_you_credit(),
			value: owed,
			format: 'money',
			group: 'customers',
			hint: m.sales_with_balance({ count: data.customers.filter((c) => c.owed > 0).length }),
			tone: owed > 0 ? 'warning' : 'neutral'
		},
		{
			key: 'overdue',
			label: m.sales_overdue(),
			value: overdue,
			format: 'money',
			group: 'customers',
			hint: m.sales_past_days_to_pay(),
			tone: overdue > 0 ? 'negative' : 'neutral'
		}
	]);
</script>

<svelte:head>
	<title>{m.sales_customers_title()}</title>
</svelte:head>

<div class="flex flex-col gap-6">
	<div class="flex flex-wrap items-center justify-between gap-2">
		<div>
			<h1 class="text-2xl font-semibold">
				{m.sales_customers_heading({ count: data.customers.length })}
			</h1>
			<p class="text-muted-foreground">{m.sales_customers_intro()}</p>
		</div>
		<div class="flex flex-wrap gap-2">
			<Button href={resolve('/dashboard/customers/credit')} variant="outline"
				><Clock /> {m.nav_credit()}</Button
			>
			{#if data.canManage}
				<DialogComp bind:open title={m.sales_add_customer()} variant="default" IconComp={Plus}>
					<form
						method="POST"
						action="?/add"
						use:enhance
						id="add-customer"
						class="flex flex-col gap-4"
					>
						<Errors allErrors={$allErrors} />
						<CustomerFields {form} {errors} priceLists={data.priceLists} />
						<Button type="submit" form="add-customer">
							{#if $delayed}<LoadingBtn
									name={m.common_saving()}
								/>{:else}{m.sales_add_customer()}{/if}
						</Button>
					</form>
				</DialogComp>
			{/if}
		</div>
	</div>

	{#if !data.organization?.sellsToCustomers}
		<p class="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
			{m.sales_customers_off_before()}
			<a class="underline" href={resolve('/dashboard/admin-panel/business')}
				>{m.nav_business_profile()}</a
			>
			{m.sales_customers_off_after()}
		</p>
	{/if}

	<div class="grid gap-4 sm:grid-cols-3">
		{#each tiles as stat (stat.key)}<StatCard {stat} />{/each}
	</div>

	<DataTable data={data.customers} {columns} fileName={m.sales_customers_title()} />
</div>
