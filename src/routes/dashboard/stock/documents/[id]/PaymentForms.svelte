<script lang="ts">
	import Link from '@lucide/svelte/icons/link';
	import Plus from '@lucide/svelte/icons/plus';
	import type { SuperValidated } from 'sveltekit-superforms';
	import { Button } from '@nahu/admin-kit/components/ui/button/index.js';
	import DialogComp from '@nahu/admin-kit/formComponents/DialogComp.svelte';
	import InputComp from '@nahu/admin-kit/formComponents/InputComp.svelte';
	import LoadingBtn from '@nahu/admin-kit/formComponents/LoadingBtn.svelte';
	import Errors from '@nahu/admin-kit/formComponents/Errors.svelte';
	import { createForm } from '@nahu/admin-kit/forms/createForm';
	import { formatETB } from '@nahu/admin-kit/global';
	import TransactionFields from '$lib/components/TransactionFields.svelte';
	import { linkSchema, transactionAdd } from '$lib/schemas/transactions';

	/** "Record payment" and "link existing", for a document with no payment yet. */
	let {
		paymentForm,
		linkForm,
		methods,
		branches,
		suppliers,
		customers = null,
		linkable,
		suggestedAmount,
		totals = null,
		withholding = { amount: 0, rate: 0 }
	}: {
		paymentForm: SuperValidated<Record<string, unknown>>;
		linkForm: SuperValidated<Record<string, unknown>>;
		methods: { value: number; name: string }[];
		branches: { value: number; name: string }[];
		suppliers: { value: number; name: string }[];
		customers?: { value: number; name: string }[] | null;
		linkable: { value: number; name: string }[];
		suggestedAmount: number;
		totals?: { net: number; vat: number; gross: number } | null;
		withholding?: { amount: number; rate: number };
	} = $props();

	/** What the suggested amount is made of: the total, and any tax to withhold from it. */
	const paymentHint = $derived.by(() => {
		if (!totals) return '';
		let text = `The document comes to ${formatETB(totals.gross)}`;
		if (totals.vat) text += `, VAT ${formatETB(totals.vat)} included`;
		text += '.';
		if (withholding.amount) {
			text += ` ${withholding.rate}% withholding on ${formatETB(totals.net)} is ${formatETB(withholding.amount)}, which leaves ${formatETB(suggestedAmount)} in cash.`;
		}
		return `${text} Change it if the payment differs.`;
	});

	let recordOpen = $state(false);
	let linkOpen = $state(false);

	// svelte-ignore state_referenced_locally
	const record = createForm(paymentForm, transactionAdd, {
		onUpdated({ form }) {
			if (form.message?.type === 'success') recordOpen = false;
		}
	});
	const recordData = record.form;
	const recordErrors = record.errors;
	const recordAll = record.allErrors;
	const recordDelayed = record.delayed;

	// svelte-ignore state_referenced_locally
	const link = createForm(linkForm, linkSchema, {
		onUpdated({ form }) {
			if (form.message?.type === 'success') linkOpen = false;
		}
	});
	const linkData = link.form;
	const linkErrors = link.errors;
</script>

<div class="flex flex-wrap gap-2">
	<DialogComp bind:open={recordOpen} title="Record payment" variant="default" IconComp={Plus}>
		<form
			method="POST"
			action="?/recordPayment"
			enctype="multipart/form-data"
			use:record.enhance
			id="record-payment"
			class="flex flex-col gap-4"
		>
			{#if totals?.gross}
				<p class="text-sm text-muted-foreground">{paymentHint}</p>
			{/if}
			<Errors allErrors={$recordAll} />
			<TransactionFields
				form={recordData}
				errors={recordErrors}
				{methods}
				{branches}
				{suppliers}
				{customers}
				withFile
			/>
			<Button type="submit" form="record-payment">
				{#if $recordDelayed}<LoadingBtn name="Saving" />{:else}Record payment{/if}
			</Button>
		</form>
	</DialogComp>

	{#if linkable.length}
		<DialogComp
			bind:open={linkOpen}
			title="Link an existing transaction"
			variant="outline"
			IconComp={Link}
		>
			<form
				method="POST"
				action="?/linkTransaction"
				use:link.enhance
				id="link-payment"
				class="flex flex-col gap-4"
			>
				<p class="text-sm text-muted-foreground">
					For a payment already recorded — one transfer that paid for several deliveries, say.
				</p>
				<InputComp
					form={linkData}
					errors={linkErrors}
					name="transactionId"
					type="combo"
					label="Transaction"
					items={linkable}
					required
				/>
				<Button type="submit" form="link-payment">Link</Button>
			</form>
		</DialogComp>
	{/if}
</div>
