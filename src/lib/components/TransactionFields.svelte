<script lang="ts">
	import type { SuperForm } from 'sveltekit-superforms';
	import InputComp from '@nahu/admin-kit/formComponents/InputComp.svelte';
	import FileUpload from '@nahu/admin-kit/formComponents/FileUpload.svelte';
	import { DIRECTION_CHOICES, PURPOSE_CHOICES } from '$lib/schemas/transactions';
	import { m } from '$lib/paraglide/messages.js';

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

<InputComp
	{form}
	{errors}
	name="direction"
	type="select"
	label={m.sales_money()}
	items={DIRECTION_CHOICES}
/>
<InputComp
	{form}
	{errors}
	name="amount"
	type="number"
	label={m.sales_amount_etb()}
	step="0.01"
	required
/>
<InputComp
	{form}
	{errors}
	name="occurredOn"
	type="date"
	label={m.sales_date_money_moved()}
	year
	required
/>
<InputComp
	{form}
	{errors}
	name="paymentMethodId"
	type="select"
	label={m.sales_paid_by()}
	items={methods}
/>
<InputComp
	{form}
	{errors}
	name="purpose"
	type="select"
	label={m.sales_for()}
	items={PURPOSE_CHOICES}
/>
{#if suppliers.length}
	<InputComp
		{form}
		{errors}
		name="supplierId"
		type="combo"
		label={m.sales_supplier_optional()}
		items={[{ value: 0, name: m.sales_not_a_supplier() }, ...suppliers]}
		description={m.sales_supplier_hint()}
	/>
{/if}
{#if customers?.length}
	<InputComp
		{form}
		{errors}
		name="customerId"
		type="combo"
		label={m.sales_pos_customer_optional()}
		items={[{ value: 0, name: m.sales_no_customer_named() }, ...customers]}
		description={m.sales_customer_hint()}
	/>
{/if}
<InputComp
	{form}
	{errors}
	name="party"
	label={$form.direction === 'out' ? m.sales_paid_to() : m.sales_received_from_label()}
	placeholder={m.sales_party_placeholder()}
/>
<InputComp
	{form}
	{errors}
	name="reference"
	label={m.sales_tx_reference()}
	placeholder={m.sales_reference_long_placeholder()}
	description={m.sales_tx_reference_hint()}
/>
<InputComp
	{form}
	{errors}
	name="receiptNumber"
	label={m.sales_receipt_invoice_no()}
	placeholder={m.sales_as_printed()}
/>
<InputComp
	{form}
	{errors}
	name="withheld"
	type="number"
	step="0.01"
	label={m.sales_tax_withheld_optional()}
	description={$form.direction === 'out' ? m.sales_withheld_out_hint() : m.sales_withheld_in_hint()}
/>
{#if Number($form.withheld) > 0}
	<InputComp
		{form}
		{errors}
		name="withholdingReceipt"
		label={m.sales_withholding_receipt_no()}
		placeholder={m.sales_as_printed_withholding()}
	/>
{/if}
<InputComp {form} {errors} name="description" label={m.common_note()} />
<InputComp
	{form}
	{errors}
	name="branchId"
	type="select"
	label={m.common_branch()}
	items={branches}
/>
{#if withFile}
	<div class="flex flex-col gap-2">
		<span class="text-sm font-medium">{m.sales_screenshot_optional()}</span>
		<FileUpload {form} name="file" placeholder={m.sales_file_placeholder()} />
		{#if $errors.file}<span class="text-sm text-destructive">{$errors.file}</span>{/if}
	</div>
{/if}
