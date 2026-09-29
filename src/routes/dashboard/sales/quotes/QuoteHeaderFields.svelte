<script lang="ts">
	import type { SuperForm } from 'sveltekit-superforms';
	import InputComp from '@nahu/admin-kit/formComponents/InputComp.svelte';
	import { m } from '$lib/paraglide/messages.js';

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
		label={m.sales_pos_customer_optional()}
		items={[{ value: 0, name: m.sales_one_off_buyer() }, ...customers]}
	/>
{/if}
{#if !$form.customerId}
	<InputComp
		{form}
		{errors}
		name="buyerName"
		label={m.sales_buyer()}
		placeholder={m.sales_buyer_placeholder()}
	/>
	<InputComp
		{form}
		{errors}
		name="buyerTin"
		label={m.sales_buyer_tin()}
		placeholder={m.sales_ten_digits()}
	/>
	<InputComp {form} {errors} name="buyerPhone" type="tel" label={m.sales_buyer_phone()} />
{/if}
<InputComp
	{form}
	{errors}
	name="locationId"
	type="combo"
	label={m.sales_goods_from()}
	items={[{ value: 0, name: m.sales_decide_later() }, ...locations]}
/>
<InputComp {form} {errors} name="quoteDate" type="date" label={m.common_date()} year required />
<InputComp
	{form}
	{errors}
	name="validUntil"
	type="date"
	label={m.sales_valid_until_optional()}
	year
	futureDays
/>
<InputComp
	{form}
	{errors}
	name="reference"
	label={m.sales_their_reference()}
	placeholder={m.sales_tender_placeholder()}
/>
<InputComp
	{form}
	{errors}
	name="terms"
	type="textarea"
	rows={2}
	label={m.sales_terms_optional()}
	placeholder={m.sales_terms_placeholder()}
/>
<InputComp {form} {errors} name="note" type="textarea" rows={2} label={m.sales_note_optional()} />
