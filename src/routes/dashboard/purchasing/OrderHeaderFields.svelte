<script lang="ts">
	import type { SuperForm, SuperValidated } from 'sveltekit-superforms';
	import InputComp from '@nahu/admin-kit/formComponents/InputComp.svelte';
	import QuickSupplier from '$lib/components/QuickSupplier.svelte';
	import { m } from '$lib/paraglide/messages.js';

	/** A purchase order's header, shared by "new order" and the draft's edit dialog. */
	let {
		form,
		errors,
		suppliers,
		locations,
		supplierForm = undefined
	}: {
		form: SuperForm<Record<string, unknown>>['form'];
		errors: SuperForm<Record<string, unknown>>['errors'];
		suppliers: { value: number; name: string }[];
		locations: { value: number; name: string }[];
		supplierForm?: SuperValidated<Record<string, unknown>>;
	} = $props();

	let added = $state<{ value: number; name: string }[]>([]);
	const supplierItems = $derived([
		...suppliers,
		...added.filter((a) => !suppliers.some((s) => s.value === a.value))
	]);
</script>

<div class="flex flex-col gap-2">
	<InputComp
		{form}
		{errors}
		name="supplierId"
		type="combo"
		label={m.purchasing_f_supplier()}
		items={supplierItems}
		required
	/>
	{#if supplierForm}
		<QuickSupplier
			form={supplierForm}
			onCreated={(s) => {
				added = [...added, s];
				$form.supplierId = s.value;
			}}
		/>
	{/if}
</div>
<InputComp
	{form}
	{errors}
	name="locationId"
	type="combo"
	label={m.purchasing_f_deliver_to()}
	items={locations}
	required
/>
<InputComp
	{form}
	{errors}
	name="orderDate"
	type="date"
	label={m.purchasing_f_order_date()}
	year
	required
/>
<InputComp
	{form}
	{errors}
	name="expectedDate"
	type="date"
	label={m.purchasing_f_expected()}
	year
	futureDays
/>
<InputComp
	{form}
	{errors}
	name="reference"
	label={m.purchasing_f_reference()}
	placeholder={m.purchasing_f_reference_ph()}
/>
<InputComp
	{form}
	{errors}
	name="note"
	type="textarea"
	rows={3}
	label={m.purchasing_f_note_supplier()}
/>
