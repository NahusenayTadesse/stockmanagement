<script lang="ts">
	import { m } from '$lib/paraglide/messages.js';
	import LanguageSwitch from '$lib/components/LanguageSwitch.svelte';
	import { resolve } from '$app/paths';
	import { Button } from '@nahu/admin-kit/components/ui/button/index.js';
	import * as Card from '@nahu/admin-kit/components/ui/card/index.js';
	import InputComp from '@nahu/admin-kit/formComponents/InputComp.svelte';
	import LoadingBtn from '@nahu/admin-kit/formComponents/LoadingBtn.svelte';
	import Errors from '@nahu/admin-kit/formComponents/Errors.svelte';
	import { createForm } from '@nahu/admin-kit/forms/createForm';
	import { resetSchema } from '$lib/schemas/auth';

	let { data } = $props();

	// svelte-ignore state_referenced_locally
	const { form, errors, enhance, delayed, allErrors } = createForm(data.form, resetSchema);
</script>

<svelte:head>
	<title>{m.admin_reset_title()}</title>
</svelte:head>

<div class="flex min-h-dvh w-full items-center justify-center px-4">
	<Card.Root class="w-full max-w-md">
		<Card.Header>
			<Card.Title class="flex flex-row items-center justify-between text-2xl"
				>{m.admin_reset_title()} <LanguageSwitch compact /></Card.Title
			>
		</Card.Header>
		<Card.Content>
			{#if data.invalid}
				<p class="mb-4">{m.admin_reset_invalid()}</p>
				<Button href={resolve('/forgot-password')} class="w-full">{m.admin_reset_new_link()}</Button
				>
			{:else}
				<form method="POST" use:enhance class="flex flex-col gap-4">
					<Errors allErrors={$allErrors} />
					<input type="hidden" name="token" value={$form.token} />
					<InputComp
						{form}
						{errors}
						name="password"
						type="password"
						label={m.admin_reset_new_password()}
						required
					/>
					<InputComp
						{form}
						{errors}
						name="confirm"
						type="password"
						label={m.admin_reset_again()}
						required
					/>
					<Button type="submit" class="w-full">
						{#if $delayed}<LoadingBtn
								name={m.common_saving()}
							/>{:else}{m.admin_reset_submit()}{/if}
					</Button>
				</form>
			{/if}
		</Card.Content>
		<Card.Footer class="text-sm text-muted-foreground">
			<a href={resolve('/login')} class="underline">{m.admin_back_to_sign_in()}</a>
		</Card.Footer>
	</Card.Root>
</div>
