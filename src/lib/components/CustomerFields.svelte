<script lang="ts">
	import type { SuperForm } from 'sveltekit-superforms';
	import InputComp from '@nahu/admin-kit/formComponents/InputComp.svelte';

	/** A customer's fields, shared by the full form, the quick-add dialog and the edit dialog. */
	let {
		form,
		errors,
		idPrefix = '',
		full = true
	}: {
		form: SuperForm<Record<string, unknown>>['form'];
		errors: SuperForm<Record<string, unknown>>['errors'];
		/** Distinct ids when the dialog sits on a page with another form using the same names. */
		idPrefix?: string;
		/** `false` for quick add: the name and a phone, enough to find them again. */
		full?: boolean;
	} = $props();
</script>

<InputComp {form} {errors} id="{idPrefix}name" name="name" label="Customer name" required />
<InputComp
	{form}
	{errors}
	id="{idPrefix}phone"
	name="phone"
	type="tel"
	label="Phone (optional)"
	placeholder="0911 234 567"
	description="Tells apart two customers with the same name."
/>
{#if full}
	<InputComp
		{form}
		{errors}
		id="{idPrefix}email"
		name="email"
		type="email"
		label="Email (optional)"
	/>
	<InputComp
		{form}
		{errors}
		id="{idPrefix}address"
		name="address"
		label="Address (optional)"
		placeholder="City, sub-city, woreda"
	/>
	<InputComp
		{form}
		{errors}
		id="{idPrefix}tin"
		name="tin"
		label="TIN (optional)"
		placeholder="10 digits — for business customers"
	/>
	<InputComp {form} {errors} id="{idPrefix}note" name="note" label="Note (optional)" />
	<InputComp
		{form}
		{errors}
		id="{idPrefix}creditLimit"
		name="creditLimit"
		type="number"
		step="0.01"
		label="Credit limit (ETB, optional)"
		description="How much they may owe at once (ዱቤ). Empty: no limit. 0: cash only."
	/>
	<InputComp
		{form}
		{errors}
		id="{idPrefix}creditDays"
		name="creditDays"
		type="number"
		label="Days to pay"
		description="A credit sale is overdue this many days after the sale."
	/>
	<InputComp
		{form}
		{errors}
		id="{idPrefix}withholdsTax"
		name="withholdsTax"
		type="select"
		label="Withholding"
		items={[
			{ value: false, name: 'Pays in full' },
			{
				value: true,
				name: 'Withholding agent — keeps back tax and gives a withholding receipt'
			}
		]}
	/>
{/if}
