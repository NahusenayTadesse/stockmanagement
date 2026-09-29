<script lang="ts">
	import type { SuperForm } from 'sveltekit-superforms';
	import InputComp from '@nahu/admin-kit/formComponents/InputComp.svelte';
	import { m } from '$lib/paraglide/messages.js';

	/** A customer's fields, shared by the full form, the quick-add dialog and the edit dialog. */
	let {
		form,
		errors,
		idPrefix = '',
		full = true,
		priceLists = []
	}: {
		form: SuperForm<Record<string, unknown>>['form'];
		errors: SuperForm<Record<string, unknown>>['errors'];
		/** Distinct ids when the dialog sits on a page with another form using the same names. */
		idPrefix?: string;
		/** `false` for quick add: the name and a phone, enough to find them again. */
		full?: boolean;
		/** The business's price lists, when it has any. */
		priceLists?: { value: number; name: string }[];
	} = $props();
</script>

<InputComp
	{form}
	{errors}
	id="{idPrefix}name"
	name="name"
	label={m.sales_customer_name()}
	required
/>
<InputComp
	{form}
	{errors}
	id="{idPrefix}phone"
	name="phone"
	type="tel"
	label={m.sales_phone_optional()}
	placeholder="0911 234 567"
	description={m.sales_phone_hint()}
/>
{#if full}
	<InputComp
		{form}
		{errors}
		id="{idPrefix}email"
		name="email"
		type="email"
		label={m.sales_email_optional()}
	/>
	<InputComp
		{form}
		{errors}
		id="{idPrefix}address"
		name="address"
		label={m.sales_address_optional()}
		placeholder={m.sales_address_placeholder()}
	/>
	<InputComp
		{form}
		{errors}
		id="{idPrefix}tin"
		name="tin"
		label={m.sales_tin_optional()}
		placeholder={m.sales_tin_placeholder()}
	/>
	<InputComp {form} {errors} id="{idPrefix}note" name="note" label={m.sales_note_optional()} />
	<InputComp
		{form}
		{errors}
		id="{idPrefix}creditLimit"
		name="creditLimit"
		type="number"
		step="0.01"
		label={m.sales_credit_limit_field()}
		description={m.sales_credit_limit_hint()}
	/>
	<InputComp
		{form}
		{errors}
		id="{idPrefix}creditDays"
		name="creditDays"
		type="number"
		label={m.sales_days_to_pay()}
		description={m.sales_days_to_pay_hint()}
	/>
	{#if priceLists.length}
		<InputComp
			{form}
			{errors}
			id="{idPrefix}priceListId"
			name="priceListId"
			type="select"
			label={m.sales_prices()}
			items={[{ value: 0, name: m.sales_list_prices() }, ...priceLists]}
			description={m.sales_prices_hint()}
		/>
	{/if}
	<InputComp
		{form}
		{errors}
		id="{idPrefix}withholdsTax"
		name="withholdsTax"
		type="select"
		label={m.sales_withholding()}
		items={[
			{ value: false, name: m.sales_pays_in_full() },
			{ value: true, name: m.sales_withholding_agent() }
		]}
	/>
{/if}
