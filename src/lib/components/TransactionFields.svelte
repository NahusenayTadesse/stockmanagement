<script lang="ts">
	import type { SuperForm } from 'sveltekit-superforms';
	import InputComp from '@nahu/admin-kit/formComponents/InputComp.svelte';
	import FileUpload from '@nahu/admin-kit/formComponents/FileUpload.svelte';
	import { DIRECTION_CHOICES, PURPOSE_CHOICES } from '$lib/schemas/transactions';

	/**
	 * The fields of a transaction, shared by "record transaction" on the list, "record payment"
	 * on a stock document, and the edit dialog. `withFile` adds the screenshot/PDF upload.
	 */
	let {
		form,
		errors,
		methods,
		branches,
		suppliers = [],
		customers = null,
		withFile = false
	}: {
		form: SuperForm<Record<string, unknown>>['form'];
		errors: SuperForm<Record<string, unknown>>['errors'];
		methods: { value: number; name: string }[];
		branches: { value: number; name: string }[];
		/** Offered when given: links the transaction to the supplier paid. */
		suppliers?: { value: number; name: string }[];
		/** Offered when given (the business sells): links the money to a listed customer. */
		customers?: { value: number; name: string }[] | null;
		withFile?: boolean;
	} = $props();
</script>

<InputComp {form} {errors} name="direction" type="select" label="Money" items={DIRECTION_CHOICES} />
<InputComp {form} {errors} name="amount" type="number" label="Amount (ETB)" step="0.01" required />
<InputComp
	{form}
	{errors}
	name="occurredOn"
	type="date"
	label="Date the money moved"
	year
	required
/>
<InputComp {form} {errors} name="paymentMethodId" type="select" label="Paid by" items={methods} />
<InputComp {form} {errors} name="purpose" type="select" label="For" items={PURPOSE_CHOICES} />
{#if suppliers.length}
	<InputComp
		{form}
		{errors}
		name="supplierId"
		type="combo"
		label="Supplier (optional)"
		items={[{ value: 0, name: '— Not a supplier —' }, ...suppliers]}
		description="Counts towards what is paid to them on their page."
	/>
{/if}
{#if customers?.length}
	<InputComp
		{form}
		{errors}
		name="customerId"
		type="combo"
		label="Customer (optional)"
		items={[{ value: 0, name: '— No customer named —' }, ...customers]}
		description="Only for listed customers. Walk-in takings need none."
	/>
{/if}
<InputComp
	{form}
	{errors}
	name="party"
	label={$form.direction === 'out' ? 'Paid to' : 'Received from'}
	placeholder="Supplier, customer, landlord…"
/>
<InputComp
	{form}
	{errors}
	name="reference"
	label="Transaction reference"
	placeholder="Bank FT number, Telebirr transaction ID, cheque no."
	description="Checked against every other transaction: the same payment cannot be recorded twice."
/>
<InputComp
	{form}
	{errors}
	name="receiptNumber"
	label="Receipt / invoice no."
	placeholder="As printed on the receipt"
/>
<InputComp
	{form}
	{errors}
	name="withheld"
	type="number"
	step="0.01"
	label="Tax withheld (ETB, optional)"
	description={$form.direction === 'out'
		? 'Kept back from the supplier and paid to the tax office. Counts as paid to them.'
		: 'Kept back by the customer, who gives you a withholding receipt. Counts as paid by them.'}
/>
{#if Number($form.withheld) > 0}
	<InputComp
		{form}
		{errors}
		name="withholdingReceipt"
		label="Withholding receipt no."
		placeholder="As printed on the withholding receipt"
	/>
{/if}
<InputComp {form} {errors} name="description" label="Note" />
<InputComp {form} {errors} name="branchId" type="select" label="Branch" items={branches} />
{#if withFile}
	<div class="flex flex-col gap-2">
		<span class="text-sm font-medium">Screenshot or PDF (optional)</span>
		<FileUpload
			{form}
			name="file"
			placeholder="Transfer screenshot or receipt — images or PDF, up to 10 MB"
		/>
		{#if $errors.file}<span class="text-sm text-destructive">{$errors.file}</span>{/if}
	</div>
{/if}
