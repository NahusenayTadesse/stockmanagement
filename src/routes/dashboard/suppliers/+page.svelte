<script lang="ts">
	import Plus from '@lucide/svelte/icons/plus';
	import DataTable from '@nahu/admin-kit/components/Table/data-table.svelte';
	import StatCard from '@nahu/admin-kit/components/reports/StatCard.svelte';
	import type { Stat } from '@nahu/admin-kit/components/reports/types';
	import { Button } from '@nahu/admin-kit/components/ui/button/index.js';
	import DialogComp from '@nahu/admin-kit/formComponents/DialogComp.svelte';
	import LoadingBtn from '@nahu/admin-kit/formComponents/LoadingBtn.svelte';
	import Errors from '@nahu/admin-kit/formComponents/Errors.svelte';
	import { createForm } from '@nahu/admin-kit/forms/createForm';
	import SupplierFields from '$lib/components/SupplierFields.svelte';
	import { supplierSchema } from '$lib/schemas/suppliers';
	import { columns } from './columns';

	let { data } = $props();
	let open = $state(false);

	// svelte-ignore state_referenced_locally
	const { form, errors, enhance, delayed, allErrors } = createForm(data.form, supplierSchema, {
		resetForm: true,
		onUpdated({ form }) {
			if (form.message?.type === 'success') open = false;
		}
	});

	const missingPhone = $derived(data.suppliers.filter((s) => !s.phone).length);

	const tiles = $derived<Stat[]>([
		{
			key: 'received',
			label: 'Received from suppliers',
			value: data.suppliers.reduce((sum, s) => sum + s.received, 0),
			format: 'money',
			group: 'suppliers',
			hint: 'Posted receipts, at cost'
		},
		{
			key: 'paid',
			label: 'Paid to suppliers',
			value: data.suppliers.reduce((sum, s) => sum + s.paid, 0),
			format: 'money',
			group: 'suppliers',
			tone: 'negative'
		},
		{
			key: 'owed',
			label: 'Still owed',
			value: data.suppliers.reduce((sum, s) => sum + Math.max(0, s.owed), 0),
			format: 'money',
			group: 'suppliers',
			hint: 'Received but not yet paid',
			tone: 'warning'
		}
	]);
</script>

<svelte:head>
	<title>Suppliers</title>
</svelte:head>

<div class="flex flex-col gap-6">
	<div class="flex flex-wrap items-center justify-between gap-2">
		<div>
			<h1 class="text-2xl font-semibold">Suppliers ({data.suppliers.length})</h1>
			<p class="text-muted-foreground">
				Who your stock comes from. Every delivery names one, and every movement of stock keeps it.
			</p>
		</div>
		{#if data.canManage}
			<DialogComp bind:open title="Add supplier" variant="default" IconComp={Plus}>
				<form
					method="POST"
					action="?/add"
					use:enhance
					id="add-supplier"
					class="flex flex-col gap-4"
				>
					<Errors allErrors={$allErrors} />
					<SupplierFields {form} {errors} />
					<Button type="submit" form="add-supplier">
						{#if $delayed}<LoadingBtn name="Saving" />{:else}Add supplier{/if}
					</Button>
				</form>
			</DialogComp>
		{/if}
	</div>

	{#if missingPhone}
		<p class="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
			{missingPhone} supplier{missingPhone === 1 ? ' was' : 's were'} carried over from before suppliers
			were tracked and {missingPhone === 1 ? 'has' : 'have'} no phone number yet. Open
			{missingPhone === 1 ? 'it' : 'each one'} and add it.
		</p>
	{/if}

	<div class="grid gap-4 sm:grid-cols-3">
		{#each tiles as stat (stat.key)}<StatCard {stat} />{/each}
	</div>

	<DataTable data={data.suppliers} {columns} fileName="Suppliers" />
</div>
