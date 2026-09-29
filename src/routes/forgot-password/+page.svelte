<script lang="ts">
	import { m } from '$lib/paraglide/messages.js';
	import AuthCard from '$lib/components/AuthCard.svelte';
	import { resolve } from '$app/paths';
	import MailCheck from '@lucide/svelte/icons/mail-check';
	import { Button } from '@nahu/admin-kit/components/ui/button/index.js';
	import InputComp from '@nahu/admin-kit/formComponents/InputComp.svelte';
	import LoadingBtn from '@nahu/admin-kit/formComponents/LoadingBtn.svelte';
	import { createForm } from '@nahu/admin-kit/forms/createForm';
	import { forgotSchema } from '$lib/schemas/auth';

	let { data } = $props();

	// svelte-ignore state_referenced_locally
	const { form, errors, enhance, delayed, message } = createForm(data.form, forgotSchema);

	// From the form's message, so it shows whether the form was sent by script or plainly.
	const sent = $derived($message?.type === 'success');
</script>

<AuthCard
	title={m.admin_forgot_title()}
	tabTitle={m.admin_forgot_page_title()}
	description={m.admin_forgot_intro()}
>
	{#if sent}
		<div class="flex flex-col items-center gap-3 py-4 text-center">
			<MailCheck class="size-10 text-primary" />
			<p>{m.admin_forgot_sent()}</p>
			<p class="text-sm text-muted-foreground">
				{m.admin_forgot_sent_help()}
			</p>
		</div>
	{:else}
		<form method="POST" use:enhance class="flex flex-col gap-4">
			<InputComp {form} {errors} name="email" type="email" label={m.admin_login_email()} required />
			<Button type="submit" class="w-full">
				{#if $delayed}<LoadingBtn name={m.common_sending()} />{:else}{m.admin_forgot_send()}{/if}
			</Button>
		</form>
	{/if}
	{#snippet footer()}
		<a href={resolve('/login')} class="underline">{m.admin_back_to_sign_in()}</a>
	{/snippet}
</AuthCard>
