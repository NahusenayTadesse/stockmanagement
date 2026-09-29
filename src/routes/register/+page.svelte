<script lang="ts">
	import { m } from '$lib/paraglide/messages.js';
	import LanguageSwitch from '$lib/components/LanguageSwitch.svelte';
	import { resolve } from '$app/paths';
	import { Button } from '@nahu/admin-kit/components/ui/button/index.js';
	import * as Card from '@nahu/admin-kit/components/ui/card/index.js';
	import Errors from '@nahu/admin-kit/formComponents/Errors.svelte';
	import InputComp from '@nahu/admin-kit/formComponents/InputComp.svelte';
	import LoadingBtn from '@nahu/admin-kit/formComponents/LoadingBtn.svelte';
	import DarkMode from '@nahu/admin-kit/components/shell/DarkMode.svelte';
	import { createForm } from '@nahu/admin-kit/forms/createForm';
	import { registerSchema } from '$lib/schemas/auth';

	let { data } = $props();

	// svelte-ignore state_referenced_locally
	const { form, errors, enhance, allErrors, delayed } = createForm(data.form, registerSchema);
</script>

<svelte:head>
	<title>{m.admin_register_title()}</title>
</svelte:head>

<div class="flex min-h-dvh w-full items-center justify-center px-4 py-8">
	<Card.Root class="w-full max-w-lg">
		<Card.Header>
			<Card.Title class="flex flex-row items-center justify-between text-2xl">
				{m.admin_register_title()}
				<span class="flex items-center gap-1"><LanguageSwitch compact /><DarkMode /></span>
			</Card.Title>
			<Card.Description>
				{m.admin_register_intro()}
			</Card.Description>
		</Card.Header>
		<Card.Content>
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
						required
					/>
				</fieldset>

				<Button type="submit" class="w-full">
					{#if $delayed}<LoadingBtn
							name={m.admin_register_setting_up()}
						/>{:else}{m.admin_register_submit()}{/if}
				</Button>
			</form>
		</Card.Content>
		<Card.Footer class="text-sm text-muted-foreground">
			{m.admin_register_already()}&nbsp;<a href={resolve('/login')} class="underline"
				>{m.admin_login_title()}</a
			>.
		</Card.Footer>
	</Card.Root>
</div>
