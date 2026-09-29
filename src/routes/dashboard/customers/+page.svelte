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
			label: 'Customers on the list',
			value: data.customers.filter((c) => c.status).length,
			format: 'count',
			group: 'customers'
		},
		{
			key: 'owed',
			label: 'Owed to you (ዱቤ)',
			value: owed,
			format: 'money',
			group: 'customers',
			hint: `${data.customers.filter((c) => c.owed > 0).length} customers with a balance`,
			tone: owed > 0 ? 'warning' : 'neutral'
		},
		{
			key: 'overdue',
			label: 'Overdue',
			value: overdue,
			format: 'money',
			group: 'customers',
			hint: 'Past their days to pay',
			tone: overdue > 0 ? 'negative' : 'neutral'
		}
	]);
</script>

<svelte:head>
	<title>Customers</title>
</svelte:head>

<div class="flex flex-col gap-6">
	<div class="flex flex-wrap items-center justify-between gap-2">
		<div>
			<h1 class="text-2xl font-semibold">Customers ({data.customers.length})</h1>
			<p class="text-muted-foreground">
				Regular buyers worth keeping track of. Naming a customer is always optional: a walk-in sale
				or an internal issue needs none.
			</p>
		</div>
		<div class="flex flex-wrap gap-2">
			<Button href={resolve('/dashboard/customers/credit')} variant="outline"
				><Clock /> Credit & ageing</Button
			>
			{#if data.canManage}
				<DialogComp bind:open title="Add customer" variant="default" IconComp={Plus}>
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
							{#if $delayed}<LoadingBtn name="Saving" />{:else}Add customer{/if}
						</Button>
					</form>
				</DialogComp>
			{/if}
		</div>
	</div>

	{#if !data.organization?.sellsToCustomers}
		<p class="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
			Customers are switched off for this business, so the customer pickers are hidden. Turn them on
			in <a class="underline" href={resolve('/dashboard/admin-panel/business')}>Business profile</a> if
			you sell.
		</p>
	{/if}

	<div class="grid gap-4 sm:grid-cols-3">
		{#each tiles as stat (stat.key)}<StatCard {stat} />{/each}
	</div>

	<DataTable data={data.customers} {columns} fileName="Customers" />
</div>
