<script lang="ts">
	import { resolve } from '$app/paths';
	import { Button } from '@nahu/admin-kit/components/ui/button/index.js';
	import Errors from '@nahu/admin-kit/formComponents/Errors.svelte';
	import InputComp from '@nahu/admin-kit/formComponents/InputComp.svelte';
	import LoadingBtn from '@nahu/admin-kit/formComponents/LoadingBtn.svelte';
	import { createForm } from '@nahu/admin-kit/forms/createForm';
	import { registerSchema } from '$lib/schemas/auth';
	import PackagePicker from '$lib/components/PackagePicker.svelte';
	import { pageTitle } from '$lib/site';
	import { m } from '$lib/paraglide/messages.js';

	let { data } = $props();

	// svelte-ignore state_referenced_locally
	const { form, errors, enhance, allErrors, delayed } = createForm(data.form, registerSchema);

	const chosen = $derived(data.packages.find((p) => p.id === Number($form.packageId)));

	/** What happens once the form is sent, in order. */
	const next = $derived([
		m.site_register_next_1(),
		m.site_register_next_2({ days: chosen?.trialDays ?? 14 }),
		m.site_register_next_3()
	]);
</script>

<svelte:head>
	<title>{pageTitle(m.admin_register_title())}</title>
	<meta name="description" content={m.site_register_intro()} />
</svelte:head>

<section
	class="site-wrap grid gap-10 pt-10 pb-20 sm:pt-14 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-14"
>
	<div>
		<h1 class="display-1">{m.admin_register_title()}</h1>
		<p class="site-lede mt-5">{m.site_register_intro()}</p>

		<ol class="mt-10 grid gap-5">
			{#each next as step, i (step)}
				<li class="grid grid-cols-[2.5rem_1fr] items-start gap-4">
					<span class="site-number" style:margin-bottom="0" aria-hidden="true">{i + 1}</span>
					<p class="pt-1.5">{step}</p>
				</li>
			{/each}
		</ol>
	</div>

	<form
		method="POST"
		action="?/register"
		use:enhance
		class="flex flex-col gap-8 border bg-card p-5 sm:p-8"
	>
		<Errors allErrors={$allErrors} />

		<fieldset>
			<legend class="display-3">{m.site_register_package()}</legend>
			<p class="mt-1 text-sm text-muted-foreground">{m.site_register_package_hint()}</p>
			<div class="mt-4">
				<PackagePicker packages={data.packages} bind:value={$form.packageId} />
			</div>
			{#if $errors.packageId}
				<p class="mt-2 text-sm text-destructive">{$errors.packageId}</p>
			{/if}
			{#if chosen}
				<p class="mt-3 text-sm text-muted-foreground">
					{m.site_register_trial_note({ days: chosen.trialDays })}
				</p>
			{/if}
		</fieldset>

		<fieldset class="flex flex-col gap-4">
			<legend class="display-3 mb-3">{m.admin_register_business()}</legend>
			<InputComp
				{form}
				{errors}
				name="business"
				label={m.admin_register_business_name()}
				required
			/>
			<div class="grid gap-4 sm:grid-cols-2">
				<InputComp
					{form}
					{errors}
					name="tin"
					label={m.admin_register_tin()}
					placeholder={m.admin_register_tin_placeholder()}
					description={m.admin_register_tin_description()}
				/>
				<InputComp {form} {errors} name="phone" type="tel" label={m.common_phone()} />
			</div>
		</fieldset>

		<fieldset class="flex flex-col gap-4">
			<legend class="display-3 mb-3">{m.admin_register_you()}</legend>
			<p class="-mt-2 text-sm text-muted-foreground">{m.site_register_owner_hint()}</p>
			<InputComp {form} {errors} name="name" label={m.admin_register_your_name()} required />
			<div class="grid gap-4 sm:grid-cols-2">
				<InputComp
					{form}
					{errors}
					name="email"
					type="email"
					label={m.admin_login_email()}
					required
				/>
				<InputComp
					{form}
					{errors}
					name="password"
					type="password"
					label={m.admin_login_password()}
					description={m.admin_v_password_8()}
					required
				/>
			</div>
		</fieldset>

		<div class="flex flex-wrap items-center gap-x-6 gap-y-3">
			<Button type="submit" size="lg">
				{#if $delayed}<LoadingBtn
						name={m.admin_register_setting_up()}
					/>{:else}{m.admin_register_submit()}{/if}
			</Button>
			<p class="text-sm text-muted-foreground">
				{m.admin_register_already()}&nbsp;<a href={resolve('/login')} class="underline"
					>{m.admin_login_title()}</a
				>
			</p>
		</div>
	</form>
</section>
