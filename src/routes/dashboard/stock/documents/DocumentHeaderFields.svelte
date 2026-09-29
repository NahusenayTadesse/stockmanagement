<script lang="ts">
	import type { SuperForm, SuperValidated } from 'sveltekit-superforms';
	import InputComp from '@nahu/admin-kit/formComponents/InputComp.svelte';
	import QuickSupplier from '$lib/components/QuickSupplier.svelte';
	import QuickCustomer from '$lib/components/QuickCustomer.svelte';
	import { ADJUSTMENT_REASONS } from '$lib/format';

	/**
	 * The header fields of a stock document, showing only what its type uses. Shared by the
	 * "new document" dialog and the draft's edit dialog.
	 */
	let {
		form,
		errors,
		locations,
		destinations = undefined,
		suppliers,
		supplierForm = undefined,
		customers = null,
		customerForm = undefined,
		lockType = false
	}: {
		form: SuperForm<Record<string, unknown>>['form'];
		errors: SuperForm<Record<string, unknown>>['errors'];
		locations: { value: number; name: string; branchId?: number }[];
		/**
		 * Where a transfer may go: every location, other branches included (a user kept to one
		 * branch still sends stock to the others). Defaults to `locations`.
		 */
		destinations?: { value: number; name: string; branchId?: number }[];
		suppliers: { value: number; name: string }[];
		/** Present when the viewer may add suppliers: shows "+ New supplier". */
		supplierForm?: SuperValidated<Record<string, unknown>>;
		/** Issues: the customer list, or `null` when the business does not sell (an internal store). */
		customers?: { value: number; name: string }[] | null;
		/** Present when the viewer may add customers: shows "+ New customer". */
		customerForm?: SuperValidated<Record<string, unknown>>;
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
	const targets = $derived(destinations ?? locations);
	/** A transfer to another branch travels: say who carries it. */
	const crossBranch = $derived.by(() => {
		if (type !== 'transfer') return false;
		const from = locations.find((l) => l.value === Number($form.fromLocationId));
		const to = targets.find((l) => l.value === Number($form.toLocationId));
		return Boolean(from && to && from.branchId !== undefined && from.branchId !== to.branchId);
	});

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

	// The same for customers added from the issue form.
	let addedCustomers = $state<{ value: number; name: string }[]>([]);
	const customerItems = $derived([
		{ value: 0, name: '— None (walk-in or internal) —' },
		...(customers ?? []),
		...addedCustomers.filter((a) => !(customers ?? []).some((c) => c.value === a.value))
	]);

	function selectNewCustomer(created: { value: number; name: string }) {
		addedCustomers = [...addedCustomers, created];
		$form.customerId = created.value;
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

{#if type !== 'receipt' && type !== 'sales_return'}
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
{#if type === 'receipt' || type === 'transfer' || type === 'sales_return'}
	<InputComp
		{form}
		{errors}
		name="toLocationId"
		type="combo"
		label={type === 'receipt' ? 'Received into' : type === 'sales_return' ? 'Returned into' : 'To'}
		items={type === 'transfer' ? targets : locations}
		required
	/>
{/if}
{#if crossBranch}
	<p class="text-sm text-muted-foreground">
		Another branch: the stock goes into transit when posted, and arrives when that branch receives
		it.
	</p>
	<div class="grid gap-4 sm:grid-cols-2">
		<InputComp {form} {errors} name="driverName" label="Driver (optional)" />
		<InputComp
			{form}
			{errors}
			name="vehiclePlate"
			label="Vehicle plate (optional)"
			placeholder="e.g. AA-3-12345"
		/>
	</div>
{/if}
{#if type === 'receipt'}
	<div class="grid gap-4 sm:grid-cols-2">
		<InputComp
			{form}
			{errors}
			name="currency"
			label="Currency (optional)"
			placeholder="ETB"
			description="Bought in dollars, euros…? Its code, e.g. USD. Empty: birr."
		/>
		{#if $form.currency && String($form.currency).toUpperCase() !== 'ETB'}
			<InputComp
				{form}
				{errors}
				name="exchangeRate"
				type="number"
				step="0.0001"
				label="Rate (birr per 1 {String($form.currency).toUpperCase()})"
				required
			/>
		{/if}
	</div>
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
	{#if customers}
		<div class="flex flex-col gap-2">
			<InputComp
				{form}
				{errors}
				name="customerId"
				type="combo"
				label="Customer (optional)"
				items={customerItems}
				description="Only for customers worth keeping track of. A walk-in sale needs none."
			/>
			{#if customerForm}
				<QuickCustomer form={customerForm} onCreated={selectNewCustomer} />
			{/if}
		</div>
	{/if}
	<InputComp
		{form}
		{errors}
		name="party"
		label={customers ? 'Issued to (optional)' : 'Issued to'}
		placeholder={customers
			? 'Department or person, if not a listed customer'
			: 'Department, ward, project or person'}
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
