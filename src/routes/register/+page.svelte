<script lang="ts">
	import { m } from '$lib/paraglide/messages.js';
	import AuthCard from '$lib/components/AuthCard.svelte';
	import { resolve } from '$app/paths';
	import { Button } from '@nahu/admin-kit/components/ui/button/index.js';
	import Errors from '@nahu/admin-kit/formComponents/Errors.svelte';
	import InputComp from '@nahu/admin-kit/formComponents/InputComp.svelte';
	import LoadingBtn from '@nahu/admin-kit/formComponents/LoadingBtn.svelte';
	import { createForm } from '@nahu/admin-kit/forms/createForm';
	import { registerSchema } from '$lib/schemas/auth';

	let { data } = $props();

	// svelte-ignore state_referenced_locally
	const { form, errors, enhance, allErrors, delayed } = createForm(data.form, registerSchema);
</script>

<AuthCard title={m.admin_register_title()} description={m.admin_register_intro()} wide>
	<form method="POST" action="?/register" use:enhance class="flex flex-col gap-4">
		<Errors allErrors={$allErrors} />

		<fieldset class="flex flex-col gap-4">
			<legend class="mb-2 text-sm font-semibold text-muted-foreground"
				>{m.admin_register_business()}</legend
			>
			<InputComp
				{form}
				{errors}
				name="business"
				label={m.admin_register_business_name()}
				required
			/>
			<InputComp
				{form}
				{errors}
				name="tin"
				label={m.admin_register_tin()}
				placeholder={m.admin_register_tin_placeholder()}
				description={m.admin_register_tin_description()}
			/>
			<InputComp {form} {errors} name="phone" type="tel" label={m.common_phone()} />
		</fieldset>

		<fieldset class="flex flex-col gap-4">
			<legend class="mb-2 text-sm font-semibold text-muted-foreground"
				>{m.admin_register_you()}</legend
			>
			<InputComp {form} {errors} name="name" label={m.admin_register_your_name()} required />
			<InputComp {form} {errors} name="email" type="email" label={m.admin_login_email()} required />
			<InputComp
				{form}
				{errors}
				name="password"
				type="password"
				label={m.admin_login_password()}
				required
			/>
		</fieldset>

		<Button type="submit" class="w-full">
			{#if $delayed}<LoadingBtn
					name={m.admin_register_setting_up()}
				/>{:else}{m.admin_register_submit()}{/if}
		</Button>
	</form>
	{#snippet footer()}
		{m.admin_register_already()}&nbsp;<a href={resolve('/login')} class="underline"
			>{m.admin_login_title()}</a
		>.
	{/snippet}
</AuthCard>
