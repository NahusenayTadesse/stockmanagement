<script lang="ts">
	import type { SuperForm } from 'sveltekit-superforms';
	import InputComp from '@nahu/admin-kit/formComponents/InputComp.svelte';

	/** A proforma's header: the new-proforma dialog and the edit dialog share it. */
	let {
		form,
		errors,
		customers,
		locations
	}: {
		form: SuperForm<Record<string, unknown>>['form'];
		errors: SuperForm<Record<string, unknown>>['errors'];
		customers: { value: number; name: string }[];
		locations: { value: number; name: string }[];
	} = $props();
</script>

{#if customers.length}
	<InputComp
		{form}
		{errors}
		name="customerId"
		type="combo"
		label="Customer (optional)"
		items={[{ value: 0, name: '— A one-off buyer (type the name below) —' }, ...customers]}
	/>
{/if}
{#if !$form.customerId}
	<InputComp
		{form}
		{errors}
		name="buyerName"
		label="Buyer"
		placeholder="e.g. Kirkos sub-city finance office"
	/>
	<InputComp {form} {errors} name="buyerTin" label="Buyer TIN (optional)" placeholder="10 digits" />
	<InputComp {form} {errors} name="buyerPhone" type="tel" label="Buyer phone (optional)" />
{/if}
<InputComp
	{form}
	{errors}
	name="locationId"
	type="combo"
	label="Goods from (optional)"
	items={[{ value: 0, name: '— Decide when it becomes a sale —' }, ...locations]}
/>
<InputComp {form} {errors} name="quoteDate" type="date" label="Date" year required />
<InputComp
	{form}
	{errors}
	name="validUntil"
	type="date"
	label="Valid until (optional)"
	year
	futureDays
/>
<InputComp
	{form}
	{errors}
	name="reference"
	label="Their reference (optional)"
	placeholder="Tender or request no."
/>
<InputComp
	{form}
	{errors}
	name="terms"
	type="textarea"
	rows={2}
	label="Terms (optional)"
	placeholder="Delivery within 5 days of order; prices valid 30 days"
/>
<InputComp {form} {errors} name="note" type="textarea" rows={2} label="Note (optional)" />
