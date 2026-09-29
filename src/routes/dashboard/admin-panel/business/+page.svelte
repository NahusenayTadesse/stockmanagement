<script lang="ts">
	import { m } from '$lib/paraglide/messages.js';
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
	<title>{m.nav_business_profile()}</title>
</svelte:head>

<div class="flex max-w-5xl flex-col gap-6">
	<div>
		<h1 class="text-2xl font-semibold">{m.nav_business_profile()}</h1>
		<p class="text-muted-foreground">
			{m.admin_biz_intro()}
		</p>
	</div>

	<div class="grid gap-6 lg:grid-cols-2">
		<Card.Root>
			<Card.Header>
				<Card.Title>{m.admin_biz_details()}</Card.Title>
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
					<InputComp
						{form}
						{errors}
						name="name"
						label={m.admin_register_business_name()}
						required
					/>
					<InputComp
						{form}
						{errors}
						name="tin"
						label={m.admin_register_tin()}
						placeholder={m.admin_biz_tin_placeholder()}
						description={m.admin_register_tin_description()}
					/>
					<InputComp {form} {errors} name="phone" type="tel" label={m.common_phone()} />
					<InputComp
						{form}
						{errors}
						name="address"
						label={m.common_address()}
						placeholder={m.admin_biz_address_placeholder()}
					/>
					<InputComp
						{form}
						{errors}
						name="sellsToCustomers"
						type="select"
						label={m.admin_biz_customers()}
						items={[
							{ value: true, name: m.admin_biz_sells() },
							{ value: false, name: m.admin_biz_internal() }
						]}
						description={m.admin_biz_customers_desc()}
					/>
					<InputComp
						{form}
						{errors}
						name="vatRegistered"
						type="select"
						label={m.admin_biz_vat()}
						items={[
							{ value: false, name: m.admin_biz_vat_no() },
							{ value: true, name: m.admin_biz_vat_yes() }
						]}
						description={m.admin_biz_vat_desc()}
					/>
					{#if $form.vatRegistered}
						<InputComp
							{form}
							{errors}
							name="vatRate"
							type="number"
							step="0.01"
							label={m.admin_biz_vat_rate()}
						/>
					{/if}
					<InputComp
						{form}
						{errors}
						name="withholdingAgent"
						type="select"
						label={m.admin_biz_withholding()}
						items={[
							{ value: false, name: m.admin_biz_wh_no() },
							{
								value: true,
								name: m.admin_biz_wh_yes()
							}
						]}
						description={m.admin_biz_wh_desc()}
					/>
					{#if $form.withholdingAgent}
						<InputComp
							{form}
							{errors}
							name="withholdingRate"
							type="number"
							step="0.01"
							label={m.admin_biz_wh_rate()}
						/>
						<InputComp
							{form}
							{errors}
							name="withholdingThreshold"
							type="number"
							step="0.01"
							label={m.admin_biz_wh_threshold()}
						/>
					{/if}
					{#if !$form.vatRegistered}
						<InputComp
							{form}
							{errors}
							name="totRate"
							type="number"
							step="0.01"
							label={m.admin_biz_tot()}
							description={m.admin_biz_tot_desc()}
						/>
					{/if}
					<InputComp
						{form}
						{errors}
						name="maxDiscountPercent"
						type="number"
						step="0.1"
						label={m.admin_biz_discount()}
						description={m.admin_biz_discount_desc()}
					/>
					<InputComp
						{form}
						{errors}
						name="einvoiceMode"
						type="select"
						label={m.admin_biz_einvoice()}
						items={[
							{ value: '', name: m.common_off() },
							{ value: 'sandbox', name: m.admin_biz_einv_sandbox() },
							{ value: 'live', name: m.admin_biz_einv_live() }
						]}
						description={m.admin_biz_einv_desc()}
					/>
					{#if $form.einvoiceMode === 'live'}
						<InputComp
							{form}
							{errors}
							name="einvoiceEndpoint"
							label={m.admin_biz_einv_endpoint()}
							placeholder={m.admin_biz_einv_endpoint_placeholder()}
						/>
						<InputComp
							{form}
							{errors}
							name="einvoiceTokenUrl"
							label={m.admin_biz_einv_token()}
							description={m.admin_biz_einv_token_desc()}
						/>
						<InputComp
							{form}
							{errors}
							name="einvoiceClientId"
							label={m.admin_biz_einv_client_id()}
						/>
						<InputComp
							{form}
							{errors}
							name="einvoiceSecret"
							label={m.admin_biz_einv_secret()}
							placeholder={data.hasEinvoiceSecret ? m.admin_biz_einv_secret_stored() : ''}
							description={m.admin_biz_einv_secret_desc()}
						/>
					{/if}
					<h3 class="mt-2 font-semibold">{m.admin_biz_stock_control()}</h3>
					<InputComp
						{form}
						{errors}
						name="costingMethod"
						type="select"
						label={m.admin_biz_costing()}
						items={[
							{ value: 'average', name: m.admin_biz_costing_avg() },
							{ value: 'fifo', name: m.admin_biz_costing_fifo() }
						]}
						description={m.admin_biz_costing_desc()}
					/>
					<InputComp
						{form}
						{errors}
						name="reserveStock"
						type="select"
						label={m.admin_biz_reservations()}
						items={[
							{ value: false, name: m.admin_biz_res_off() },
							{
								value: true,
								name: m.admin_biz_res_on()
							}
						]}
						description={m.admin_biz_res_desc()}
					/>
					<p class="text-sm text-muted-foreground">
						{m.admin_biz_approvals_intro()}
					</p>
					<InputComp
						{form}
						{errors}
						name="approveAdjustmentsOver"
						type="number"
						step="0.01"
						label={m.admin_biz_adj_over()}
					/>
					<InputComp
						{form}
						{errors}
						name="approveWriteOffs"
						type="select"
						label={m.admin_biz_writeoffs()}
						items={[
							{ value: false, name: m.admin_biz_wo_limit() },
							{ value: true, name: m.admin_biz_wo_always() }
						]}
						description={m.admin_biz_wo_desc()}
					/>
					<InputComp
						{form}
						{errors}
						name="approveCountsOver"
						type="number"
						step="0.01"
						label={m.admin_biz_counts_over()}
					/>
					<InputComp
						{form}
						{errors}
						name="approveOrdersOver"
						type="number"
						step="0.01"
						label={m.admin_biz_orders_over()}
					/>
					<Button type="submit" form="details">
						{#if $delayed}<LoadingBtn name={m.common_saving()} />{:else}<Save />
							{m.common_save()}{/if}
					</Button>
				</form>
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Header>
				<Card.Title>{m.admin_biz_logo()}</Card.Title>
				<Card.Description>{m.admin_biz_logo_desc()}</Card.Description>
			</Card.Header>
			<Card.Content class="flex flex-col gap-4">
				{#if data.org.logo}
					<div class="flex items-center gap-4">
						<img
							src={fileUrl(data.org.logo)}
							alt={m.admin_biz_logo_alt({ name: data.org.name })}
							class="h-24 max-w-48 rounded border bg-white object-contain p-2"
						/>
						<form method="POST" action="?/removeLogo" use:enhance>
							<Button type="submit" variant="ghost" class="text-destructive"
								><Trash /> {m.admin_biz_remove()}</Button
							>
						</form>
					</div>
				{:else}
					<p class="text-sm text-muted-foreground">
						{m.admin_biz_no_logo()}
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
					<FileUpload form={logoData} name="logo" placeholder={m.admin_biz_logo_placeholder()} />
					{#if $logoErrors.logo}<span class="text-sm text-destructive">{$logoErrors.logo}</span
						>{/if}
					<Button type="submit" form="logo" variant="outline">
						{#if $logoDelayed}<LoadingBtn name={m.admin_biz_uploading()} />{:else}<Upload />
							{data.org.logo ? m.admin_biz_replace_logo() : m.admin_biz_upload_logo()}{/if}
					</Button>
				</form>
			</Card.Content>
		</Card.Root>
	</div>
</div>
