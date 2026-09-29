<script lang="ts">
	import type { SuperForm } from 'sveltekit-superforms';
	import InputComp from '@nahu/admin-kit/formComponents/InputComp.svelte';
	import { m } from '$lib/paraglide/messages.js';

	/** A supplier's fields, shared by the full form, the quick-add dialog and the edit dialog. */
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
		/** `false` for quick add: only what is needed to start receiving. */
		full?: boolean;
	} = $props();
</script>

<InputComp
	{form}
	{errors}
	id="{idPrefix}name"
	name="name"
	label={m.purchasing_f_supplier_name()}
	required
/>
<InputComp
	{form}
	{errors}
	id="{idPrefix}phone"
	name="phone"
	type="tel"
	label={m.common_phone()}
	placeholder="0911 234 567"
	required
/>
<InputComp
	{form}
	{errors}
	id="{idPrefix}email"
	name="email"
	type="email"
	label={m.purchasing_f_email_opt()}
/>
<InputComp
	{form}
	{errors}
	id="{idPrefix}address"
	name="address"
	label={m.purchasing_f_address_opt()}
	placeholder={m.purchasing_f_address_ph()}
/>
{#if full}
	<InputComp
		{form}
		{errors}
		id="{idPrefix}tin"
		name="tin"
		label={m.purchasing_f_tin_opt()}
		placeholder={m.purchasing_f_tin_ph()}
	/>
	<InputComp
		{form}
		{errors}
		id="{idPrefix}contactPerson"
		name="contactPerson"
		label={m.purchasing_f_contact_opt()}
	/>
	<InputComp {form} {errors} id="{idPrefix}note" name="note" label={m.purchasing_f_note_opt()} />
	<InputComp
		{form}
		{errors}
		id="{idPrefix}leadTimeDays"
		name="leadTimeDays"
		type="number"
		step="1"
		label={m.purchasing_f_lead_opt()}
		description={m.purchasing_f_lead_desc()}
	/>
{/if}
<InputComp
	{form}
	{errors}
	id="{idPrefix}vatRegistered"
	name="vatRegistered"
	type="select"
	label={m.purchasing_f_vat()}
	items={[
		{ value: false, name: m.purchasing_f_vat_no() },
		{ value: true, name: m.purchasing_f_vat_yes() }
	]}
/>
