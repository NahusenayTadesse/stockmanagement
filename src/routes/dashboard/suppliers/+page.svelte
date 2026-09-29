<script lang="ts">
	import Plus from '@lucide/svelte/icons/plus';
	import DataTable from '@nahu/admin-kit/components/Table/data-table.svelte';
	import StatCard from '$lib/components/StatCard.svelte';
	import type { Stat } from '@nahu/admin-kit/components/reports/types';
	import { Button } from '@nahu/admin-kit/components/ui/button/index.js';
	import DialogComp from '@nahu/admin-kit/formComponents/DialogComp.svelte';
	import LoadingBtn from '@nahu/admin-kit/formComponents/LoadingBtn.svelte';
	import Errors from '@nahu/admin-kit/formComponents/Errors.svelte';
	import { createForm } from '@nahu/admin-kit/forms/createForm';
	import PageHeader from '@nahu/admin-kit/components/PageHeader.svelte';
	import Notice from '@nahu/admin-kit/components/Notice.svelte';
	import SupplierFields from '$lib/components/SupplierFields.svelte';
	import { supplierSchema } from '$lib/schemas/suppliers';
	import { columns as supplierColumns } from './columns';
	import { m } from '$lib/paraglide/messages.js';

	let { data } = $props();
	let open = $state(false);
	const columns = supplierColumns();

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
			label: m.purchasing_sup_received_tile(),
			value: data.suppliers.reduce((sum, s) => sum + s.received, 0),
			format: 'money',
			group: 'suppliers',
			hint: m.purchasing_sup_received_hint()
		},
		{
			key: 'paid',
			label: m.purchasing_sup_paid_tile(),
			value: data.suppliers.reduce((sum, s) => sum + s.paid, 0),
			format: 'money',
			group: 'suppliers',
			tone: 'negative'
		},
		{
			key: 'owed',
			label: m.purchasing_sup_owed_tile(),
			value: data.suppliers.reduce((sum, s) => sum + Math.max(0, s.owed), 0),
			format: 'money',
			group: 'suppliers',
			hint: m.purchasing_sup_owed_hint(),
			tone: 'warning'
		}
	]);
</script>

<div class="flex flex-col gap-6">
	<PageHeader
		title={m.purchasing_suppliers_heading({ n: data.suppliers.length })}
		tabTitle={m.purchasing_suppliers_title()}
		description={m.purchasing_suppliers_intro()}
	>
		{#snippet actions()}
			{#if data.canManage}
				<DialogComp bind:open title={m.purchasing_add_supplier()} variant="default" IconComp={Plus}>
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
							{#if $delayed}<LoadingBtn
									name={m.common_saving()}
								/>{:else}{m.purchasing_add_supplier()}{/if}
						</Button>
					</form>
				</DialogComp>
			{/if}
		{/snippet}
	</PageHeader>

	{#if missingPhone}
		<Notice tone="warning">
			{missingPhone === 1
				? m.purchasing_missing_phone_one()
				: m.purchasing_missing_phone_many({ n: missingPhone })}
		</Notice>
	{/if}

	<div class="grid gap-4 sm:grid-cols-3">
		{#each tiles as stat (stat.key)}<StatCard {stat} />{/each}
	</div>

	<DataTable data={data.suppliers} {columns} fileName={m.purchasing_suppliers_title()} />
</div>
