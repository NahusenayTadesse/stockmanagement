<script lang="ts">
	import type { SuperForm, SuperValidated } from 'sveltekit-superforms';
	import InputComp from '@nahu/admin-kit/formComponents/InputComp.svelte';
	import QuickSupplier from '$lib/components/QuickSupplier.svelte';
	import { ADJUSTMENT_REASONS } from '$lib/format';

	/**
	 * The header fields of a stock document, showing only what its type uses. Shared by the
	 * "new document" dialog and the draft's edit dialog.
	 */
	let {
		form,
		errors,
		locations,
		suppliers,
		supplierForm = undefined,
		lockType = false
	}: {
		form: SuperForm<Record<string, unknown>>['form'];
		errors: SuperForm<Record<string, unknown>>['errors'];
		locations: { value: number; name: string }[];
		suppliers: { value: number; name: string }[];
		/** Present when the viewer may add suppliers: shows "+ New supplier". */
		supplierForm?: SuperValidated<Record<string, unknown>>;
		/** A draft keeps its type: its lines were entered for it. */
		lockType?: boolean;
	} = $props();

	const TYPES = [
		{ value: 'receipt', name: 'Goods receipt — stock comes in' },
		{ value: 'issue', name: 'Issue — stock goes out' },
		{ value: 'transfer', name: 'Transfer — between locations' },
		{ value: 'adjustment', name: 'Adjustment — count, damage, expiry' }
	];

	const type = $derived($form.type as string);

	/**
	 * Suppliers added from this form, shown at once rather than after the page's data reloads — so
	 * the one just created is already selected and named in the picker.
	 */
	let added = $state<{ value: number; name: string }[]>([]);
	const supplierItems = $derived([
		...suppliers,
		...added.filter((a) => !suppliers.some((s) => s.value === a.value))
	]);

	function selectNew(created: { value: number; name: string }) {
		added = [...added, created];
		$form.supplierId = created.value;
	}
</script>

{#if !lockType}
	<InputComp {form} {errors} name="type" type="select" label="Type" items={TYPES} />
{/if}
<InputComp {form} {errors} name="docDate" type="date" label="Date" year required />

{#if type === 'receipt'}
	<div class="flex flex-col gap-2">
		<InputComp
			{form}
			{errors}
			name="supplierId"
			type="combo"
			label="Supplier"
			items={supplierItems}
			required
		/>
		{#if supplierForm}
			<QuickSupplier form={supplierForm} onCreated={selectNew} />
		{/if}
	</div>
{/if}

{#if type !== 'receipt'}
	<InputComp
		{form}
		{errors}
		name="fromLocationId"
		type="combo"
		label={type === 'adjustment' ? 'Location' : 'From'}
		items={locations}
		required
	/>
{/if}
{#if type === 'receipt' || type === 'transfer'}
	<InputComp
		{form}
		{errors}
		name="toLocationId"
		type="combo"
		label={type === 'receipt' ? 'Received into' : 'To'}
		items={locations}
		required
	/>
{/if}
{#if type === 'adjustment'}
	<InputComp
		{form}
		{errors}
		name="reason"
		type="select"
		label="Reason"
		items={ADJUSTMENT_REASONS}
	/>
{/if}
{#if type === 'issue'}
	<InputComp
		{form}
		{errors}
		name="party"
		label="Issued to"
		placeholder="Department, person or customer"
	/>
{/if}
<InputComp
	{form}
	{errors}
	name="reference"
	label="Reference"
	placeholder={type === 'receipt'
		? 'Supplier invoice or delivery note no.'
		: 'Requisition or voucher no.'}
/>
<InputComp {form} {errors} name="note" type="textarea" rows={3} label="Note" />
