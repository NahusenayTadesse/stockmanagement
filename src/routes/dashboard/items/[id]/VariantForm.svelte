<script lang="ts">
	import Plus from '@lucide/svelte/icons/plus';
	import type { SuperValidated } from 'sveltekit-superforms';
	import { Button } from '@nahu/admin-kit/components/ui/button/index.js';
	import DialogComp from '@nahu/admin-kit/formComponents/DialogComp.svelte';
	import InputComp from '@nahu/admin-kit/formComponents/InputComp.svelte';
	import LoadingBtn from '@nahu/admin-kit/formComponents/LoadingBtn.svelte';
	import Errors from '@nahu/admin-kit/formComponents/Errors.svelte';
	import { createForm } from '@nahu/admin-kit/forms/createForm';
	import { variantAdd } from '$lib/schemas/items';

	/** "Add variant": a new item with this one's settings, under its own code and label. */
	let { data }: { data: SuperValidated<Record<string, unknown>> } = $props();

	let open = $state(false);

	// svelte-ignore state_referenced_locally
	const { form, errors, enhance, delayed, allErrors } = createForm(data, variantAdd, {
		resetForm: true,
		onResult({ result }) {
			if (result.type === 'success') open = false;
		}
	});
</script>

<DialogComp
	bind:open
	title="Add variant"
	variant="outline"
	IconComp={Plus}
	triggerClass="self-start"
>
	<form
		method="POST"
		action="?/addVariant"
		use:enhance
		id="variant-form"
		class="flex flex-col gap-4"
	>
		<p class="text-sm text-muted-foreground">
			It copies this item's unit, category, supplier, tracking, VAT and pack units. Its stock is
			counted separately.
		</p>
		<Errors allErrors={$allErrors} />
		<InputComp
			{form}
			{errors}
			name="variantLabel"
			label="What tells it apart"
			placeholder="Red / XL, 500 mg, 1 litre"
			required
		/>
		<InputComp {form} {errors} name="sku" label="Code / SKU" required />
		<InputComp
			{form}
			{errors}
			name="salePrice"
			type="number"
			step="0.01"
			label="Sale price before VAT (empty: same as this item)"
		/>
		<InputComp {form} {errors} name="barcode" label="Barcode (optional)" />
		<Button type="submit" form="variant-form">
			{#if $delayed}<LoadingBtn name="Saving" />{:else}Add variant{/if}
		</Button>
	</form>
</DialogComp>
