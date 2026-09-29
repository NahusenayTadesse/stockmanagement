<script lang="ts">
	import Plus from '@lucide/svelte/icons/plus';
	import type { SuperValidated } from 'sveltekit-superforms';
	import { Button } from '@nahu/admin-kit/components/ui/button/index.js';
	import DialogComp from '@nahu/admin-kit/formComponents/DialogComp.svelte';
	import LoadingBtn from '@nahu/admin-kit/formComponents/LoadingBtn.svelte';
	import Errors from '@nahu/admin-kit/formComponents/Errors.svelte';
	import { createForm } from '@nahu/admin-kit/forms/createForm';
	import { supplierSchema } from '$lib/schemas/suppliers';
	import SupplierFields from './SupplierFields.svelte';
	import { m } from '$lib/paraglide/messages.js';

	/**
	 * "+ New supplier", for the forms that need one chosen — so receiving is never held up by a
	 * supplier that has not been set up yet. Posts to the suppliers page's own `add` action and hands
	 * the new supplier to `onCreated`, which selects it in the form that asked.
	 */
	let {
		form: data,
		onCreated
	}: {
		form: SuperValidated<Record<string, unknown>>;
		onCreated: (supplier: { value: number; name: string }) => void;
	} = $props();

	let open = $state(false);

	// svelte-ignore state_referenced_locally
	const { form, errors, enhance, delayed, allErrors } = createForm(data, supplierSchema, {
		resetForm: true,
		/*
		 * No reload of the page's data: that would re-seed the form that asked for the supplier and
		 * wipe what the user has typed there, the new selection included. The caller adds the new
		 * supplier to its own picker instead.
		 */
		invalidateAll: false,
		onResult({ result }) {
			if (result.type !== 'success') return;
			const created = (result.data as { supplier?: { value: number; name: string } } | undefined)
				?.supplier;
			if (created) {
				onCreated(created);
				open = false;
			}
		}
	});
</script>

<DialogComp
	bind:open
	title={m.purchasing_new_supplier()}
	variant="outline"
	IconComp={Plus}
	triggerClass="self-start"
>
	<form
		method="POST"
		action="/dashboard/suppliers?/add"
		use:enhance
		id="quick-supplier"
		class="flex flex-col gap-4"
	>
		<p class="text-sm text-muted-foreground">{m.purchasing_selected_when_saved()}</p>
		<Errors allErrors={$allErrors} />
		<SupplierFields {form} {errors} idPrefix="quick-" full={false} />
		<Button type="submit" form="quick-supplier">
			{#if $delayed}<LoadingBtn name={m.common_saving()} />{:else}{m.purchasing_add_supplier()}{/if}
		</Button>
	</form>
</DialogComp>
