<script lang="ts">
	import { m } from '$lib/paraglide/messages.js';
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
	title={m.stock_add_variant()}
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
			{m.stock_variant_copies()}
		</p>
		<Errors allErrors={$allErrors} />
		<InputComp
			{form}
			{errors}
			name="variantLabel"
			label={m.stock_what_tells_apart()}
			placeholder={m.stock_variant_placeholder()}
			required
		/>
		<InputComp {form} {errors} name="sku" label={m.stock_f_code_sku()} required />
		<InputComp
			{form}
			{errors}
			name="salePrice"
			type="number"
			step="0.01"
			label={m.stock_variant_price()}
		/>
		<InputComp {form} {errors} name="barcode" label={m.stock_barcode_optional()} />
		<Button type="submit" form="variant-form">
			{#if $delayed}<LoadingBtn name={m.common_saving()} />{:else}{m.stock_add_variant()}{/if}
		</Button>
	</form>
</DialogComp>
