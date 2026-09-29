<script lang="ts">
	import Plus from '@lucide/svelte/icons/plus';
	import type { SuperValidated } from 'sveltekit-superforms';
	import { Button } from '@nahu/admin-kit/components/ui/button/index.js';
	import DialogComp from '@nahu/admin-kit/formComponents/DialogComp.svelte';
	import LoadingBtn from '@nahu/admin-kit/formComponents/LoadingBtn.svelte';
	import Errors from '@nahu/admin-kit/formComponents/Errors.svelte';
	import { createForm } from '@nahu/admin-kit/forms/createForm';
	import { customerSchema } from '$lib/schemas/customers';
	import CustomerFields from './CustomerFields.svelte';
	import { m } from '$lib/paraglide/messages.js';

	/**
	 * "+ New customer" beside a customer picker. Posts to the customers page's `add` action and
	 * hands the new customer to `onCreated`, which selects it — see QuickSupplier for why the page's
	 * data is not reloaded.
	 */
	let {
		form: data,
		onCreated
	}: {
		form: SuperValidated<Record<string, unknown>>;
		onCreated: (customer: { value: number; name: string }) => void;
	} = $props();

	let open = $state(false);

	// svelte-ignore state_referenced_locally
	const { form, errors, enhance, delayed, allErrors } = createForm(data, customerSchema, {
		resetForm: true,
		invalidateAll: false,
		onResult({ result }) {
			if (result.type !== 'success') return;
			const created = (result.data as { customer?: { value: number; name: string } } | undefined)
				?.customer;
			if (created) {
				onCreated(created);
				open = false;
			}
		}
	});
</script>

<DialogComp
	bind:open
	title={m.sales_new_customer()}
	variant="outline"
	IconComp={Plus}
	triggerClass="self-start"
>
	<form
		method="POST"
		action="/dashboard/customers?/add"
		use:enhance
		id="quick-customer"
		class="flex flex-col gap-4"
	>
		<p class="text-sm text-muted-foreground">{m.sales_selected_when_saved()}</p>
		<Errors allErrors={$allErrors} />
		<CustomerFields {form} {errors} idPrefix="quick-customer-" full={false} />
		<Button type="submit" form="quick-customer">
			{#if $delayed}<LoadingBtn name={m.common_saving()} />{:else}{m.sales_add_customer()}{/if}
		</Button>
	</form>
</DialogComp>
