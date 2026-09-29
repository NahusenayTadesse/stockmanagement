<script lang="ts">
	import { enhance } from '$app/forms';
	import Save from '@lucide/svelte/icons/save';
	import Trash from '@lucide/svelte/icons/trash';
	import Upload from '@lucide/svelte/icons/upload';
	import * as Card from '@nahu/admin-kit/components/ui/card/index.js';
	import { Button } from '@nahu/admin-kit/components/ui/button/index.js';
	import InputComp from '@nahu/admin-kit/formComponents/InputComp.svelte';
	import FileUpload from '@nahu/admin-kit/formComponents/FileUpload.svelte';
	import LoadingBtn from '@nahu/admin-kit/formComponents/LoadingBtn.svelte';
	import Errors from '@nahu/admin-kit/formComponents/Errors.svelte';
	import { createForm } from '@nahu/admin-kit/forms/createForm';
	import { fileUrl } from '@nahu/admin-kit/files';
	import { businessSchema, logoSchema } from '$lib/schemas/business';

	let { data } = $props();

	// svelte-ignore state_referenced_locally
	const details = createForm(data.form, businessSchema, { resetForm: false });
	const form = details.form;
	const errors = details.errors;
	const allErrors = details.allErrors;
	const delayed = details.delayed;

	// svelte-ignore state_referenced_locally
	const logo = createForm(data.logoForm, logoSchema, { resetForm: true });
	const logoData = logo.form;
	const logoErrors = logo.errors;
	const logoDelayed = logo.delayed;
</script>

<svelte:head>
	<title>Business profile</title>
</svelte:head>

<div class="flex max-w-5xl flex-col gap-6">
	<div>
		<h1 class="text-2xl font-semibold">Business profile</h1>
		<p class="text-muted-foreground">
			How your business appears in the menu and on every printed receipt, issue voucher and transfer
			note.
		</p>
	</div>

	<div class="grid gap-6 lg:grid-cols-2">
		<Card.Root>
			<Card.Header>
				<Card.Title>Details</Card.Title>
			</Card.Header>
			<Card.Content>
				<form
					method="POST"
					action="?/save"
					use:details.enhance
					id="details"
					class="flex flex-col gap-4"
				>
					<Errors allErrors={$allErrors} />
					<InputComp {form} {errors} name="name" label="Business name" required />
					<InputComp
						{form}
						{errors}
						name="tin"
						label="TIN"
						placeholder="10 digits"
						description="Printed on your documents."
					/>
					<InputComp {form} {errors} name="phone" type="tel" label="Phone" />
					<InputComp
						{form}
						{errors}
						name="address"
						label="Address"
						placeholder="Sub-city, woreda, street"
					/>
					<InputComp
						{form}
						{errors}
						name="sellsToCustomers"
						type="select"
						label="Customers"
						items={[
							{ value: true, name: 'We sell — keep a customer list (always optional on a sale)' },
							{ value: false, name: 'Internal store only — we issue to departments, never sell' }
						]}
						description="The internal setting hides the customer list and every customer picker. Nothing recorded is lost; switch back at any time."
					/>
					<InputComp
						{form}
						{errors}
						name="vatRegistered"
						type="select"
						label="VAT"
						items={[
							{ value: false, name: 'Not VAT-registered — no VAT on sales' },
							{ value: true, name: 'VAT-registered — sales add VAT' }
						]}
						description="Applies to sales posted from now on; posted invoices keep the VAT they were posted with."
					/>
					{#if $form.vatRegistered}
						<InputComp
							{form}
							{errors}
							name="vatRate"
							type="number"
							step="0.01"
							label="VAT rate (%)"
						/>
					{/if}
					<InputComp
						{form}
						{errors}
						name="withholdingAgent"
						type="select"
						label="Withholding"
						items={[
							{ value: false, name: 'Not a withholding agent' },
							{
								value: true,
								name: 'Withholding agent — keep back tax on large purchases'
							}
						]}
						description="Payments for deliveries at or above the threshold suggest the tax to keep back (30% if the supplier has no TIN)."
					/>
					{#if $form.withholdingAgent}
						<InputComp
							{form}
							{errors}
							name="withholdingRate"
							type="number"
							step="0.01"
							label="Withholding rate (%)"
						/>
						<InputComp
							{form}
							{errors}
							name="withholdingThreshold"
							type="number"
							step="0.01"
							label="From a purchase of (ETB, before VAT)"
						/>
					{/if}
					{#if !$form.vatRegistered}
						<InputComp
							{form}
							{errors}
							name="totRate"
							type="number"
							step="0.01"
							label="Turnover tax (TOT) rate on goods (%, optional)"
							description="Only for a TOT payer that is not VAT-registered. Empty: no TOT. Items can set their own rate (services are often higher)."
						/>
					{/if}
					<InputComp
						{form}
						{errors}
						name="einvoiceMode"
						type="select"
						label="E-invoicing (Ministry of Revenues)"
						items={[
							{ value: '', name: 'Off' },
							{ value: 'sandbox', name: 'Sandbox — try the flow; nothing is sent' },
							{ value: 'live', name: 'Live — send every sale to the endpoint below' }
						]}
						description="Optional. Invoices are sent after a sale is posted; a failure never blocks the sale and can be retried."
					/>
					{#if $form.einvoiceMode === 'live'}
						<InputComp
							{form}
							{errors}
							name="einvoiceEndpoint"
							label="Invoice endpoint URL"
							placeholder="From your e-invoicing registration"
						/>
						<InputComp
							{form}
							{errors}
							name="einvoiceTokenUrl"
							label="Token URL (optional)"
							description="For OAuth client-credentials sign-in. Empty: the client ID and secret are sent as Basic auth."
						/>
						<InputComp {form} {errors} name="einvoiceClientId" label="Client ID" />
						<InputComp
							{form}
							{errors}
							name="einvoiceSecret"
							label="Client secret"
							placeholder={data.hasEinvoiceSecret ? 'Stored — leave empty to keep it' : ''}
							description="Stored encrypted; never shown again."
						/>
					{/if}
					<Button type="submit" form="details">
						{#if $delayed}<LoadingBtn name="Saving" />{:else}<Save /> Save{/if}
					</Button>
				</form>
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Header>
				<Card.Title>Logo</Card.Title>
				<Card.Description
					>PNG, JPG or WebP, up to 2 MB. A square or wide image works best.</Card.Description
				>
			</Card.Header>
			<Card.Content class="flex flex-col gap-4">
				{#if data.org.logo}
					<div class="flex items-center gap-4">
						<img
							src={fileUrl(data.org.logo)}
							alt="{data.org.name} logo"
							class="h-24 max-w-48 rounded border bg-white object-contain p-2"
						/>
						<form method="POST" action="?/removeLogo" use:enhance>
							<Button type="submit" variant="ghost" class="text-destructive"
								><Trash /> Remove</Button
							>
						</form>
					</div>
				{:else}
					<p class="text-sm text-muted-foreground">
						No logo yet — the business name is shown instead.
					</p>
				{/if}

				<form
					method="POST"
					action="?/uploadLogo"
					enctype="multipart/form-data"
					use:logo.enhance
					id="logo"
					class="flex flex-col gap-3"
				>
					<FileUpload form={logoData} name="logo" placeholder="PNG, JPG or WebP (max 2 MB)" />
					{#if $logoErrors.logo}<span class="text-sm text-destructive">{$logoErrors.logo}</span
						>{/if}
					<Button type="submit" form="logo" variant="outline">
						{#if $logoDelayed}<LoadingBtn name="Uploading" />{:else}<Upload />
							{data.org.logo ? 'Replace logo' : 'Upload logo'}{/if}
					</Button>
				</form>
			</Card.Content>
		</Card.Root>
	</div>
</div>
