<script lang="ts">
	import Plus from '@lucide/svelte/icons/plus';
	import DataTable from '@nahu/admin-kit/components/Table/data-table.svelte';
	import { Button } from '@nahu/admin-kit/components/ui/button/index.js';
	import DialogComp from '@nahu/admin-kit/formComponents/DialogComp.svelte';
	import LoadingBtn from '@nahu/admin-kit/formComponents/LoadingBtn.svelte';
	import Errors from '@nahu/admin-kit/formComponents/Errors.svelte';
	import { createForm } from '@nahu/admin-kit/forms/createForm';
	import { documentHeader } from '$lib/schemas/stock';
	import DocumentHeaderFields from './DocumentHeaderFields.svelte';
	import { columns } from './columns';

	let { data } = $props();
	let open = $state(false);

	// svelte-ignore state_referenced_locally
	const { form, errors, enhance, delayed, allErrors } = createForm(data.form, documentHeader);
</script>

<svelte:head>
	<title>Stock documents</title>
</svelte:head>

<div class="flex flex-col gap-4">
	<div class="flex flex-wrap items-center justify-between gap-2">
		<div>
			<h1 class="text-2xl font-semibold">Stock documents</h1>
			<p class="text-muted-foreground">
				Receipts, issues, transfers and adjustments. Stock changes only when a document is posted.
			</p>
		</div>
		{#if data.canDraft}
			<DialogComp bind:open title="New document" variant="default" IconComp={Plus}>
				<form method="POST" action="?/create" use:enhance id="create" class="flex flex-col gap-4">
					<Errors allErrors={$allErrors} />
					<DocumentHeaderFields
						{form}
						{errors}
						locations={data.locations}
						destinations={data.destinations}
						suppliers={data.suppliers}
						supplierForm={data.supplierForm}
						customers={data.customers}
						customerForm={data.customerForm}
					/>
					<Button type="submit" form="create">
						{#if $delayed}<LoadingBtn name="Creating" />{:else}Create draft{/if}
					</Button>
				</form>
			</DialogComp>
		{/if}
	</div>

	<DataTable
		data={data.documents}
		{columns}
		fileName="Stock documents"
		facetKeys={['type', 'status']}
	/>
</div>
