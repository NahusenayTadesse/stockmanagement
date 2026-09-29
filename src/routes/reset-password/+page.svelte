<script lang="ts">
	import { m } from '$lib/paraglide/messages.js';
	import AuthCard from '$lib/components/AuthCard.svelte';
	import { resolve } from '$app/paths';
	import { Button } from '@nahu/admin-kit/components/ui/button/index.js';
	import InputComp from '@nahu/admin-kit/formComponents/InputComp.svelte';
	import LoadingBtn from '@nahu/admin-kit/formComponents/LoadingBtn.svelte';
	import Errors from '@nahu/admin-kit/formComponents/Errors.svelte';
	import { createForm } from '@nahu/admin-kit/forms/createForm';
	import { resetSchema } from '$lib/schemas/auth';

	let { data } = $props();

	// svelte-ignore state_referenced_locally
	const { form, errors, enhance, delayed, allErrors } = createForm(data.form, resetSchema);
</script>

<AuthCard title={m.admin_reset_title()}>
	{#if data.invalid}
		<p class="mb-4">{m.admin_reset_invalid()}</p>
		<Button href={resolve('/forgot-password')} class="w-full">{m.admin_reset_new_link()}</Button>
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
				{#if $delayed}<LoadingBtn name={m.common_saving()} />{:else}{m.admin_reset_submit()}{/if}
			</Button>
		</form>
	{/if}
	{#snippet footer()}
		<a href={resolve('/login')} class="underline">{m.admin_back_to_sign_in()}</a>
	{/snippet}
</AuthCard>
