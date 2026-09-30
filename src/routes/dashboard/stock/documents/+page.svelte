<script lang="ts">
	import { m } from '$lib/paraglide/messages.js';
	import Plus from '@lucide/svelte/icons/plus';
	import DataTable from '@nahu/admin-kit/components/Table/data-table.svelte';
	import PageHeader from '@nahu/admin-kit/components/PageHeader.svelte';
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

<div class="flex flex-col gap-4">
	<PageHeader title={m.stock_docs_title()} description={m.stock_docs_intro()}>
		{#snippet actions()}
			{#if data.canDraft}
				<span class="inline-flex" data-tour="documents-new">
					<DialogComp bind:open title={m.stock_docs_new()} variant="default" IconComp={Plus}>
						<form
							method="POST"
							action="?/create"
							use:enhance
							id="create"
							class="flex flex-col gap-4"
						>
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
								{#if $delayed}<LoadingBtn
										name={m.stock_creating()}
									/>{:else}{m.stock_create_draft()}{/if}
							</Button>
						</form>
					</DialogComp>
				</span>
			{/if}
		{/snippet}
	</PageHeader>

	<div data-tour="documents-list">
		<DataTable
			data={data.documents}
			{columns}
			fileName={m.stock_docs_title()}
			facetKeys={['type', 'status']}
		/>
	</div>
</div>
