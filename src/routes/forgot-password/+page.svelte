<script lang="ts">
	import { resolve } from '$app/paths';
	import MailCheck from '@lucide/svelte/icons/mail-check';
	import { Button } from '@nahu/admin-kit/components/ui/button/index.js';
	import * as Card from '@nahu/admin-kit/components/ui/card/index.js';
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

<svelte:head>
	<title>Forgot password</title>
</svelte:head>

<div class="flex min-h-dvh w-full items-center justify-center px-4">
	<Card.Root class="w-full max-w-md">
		<Card.Header>
			<Card.Title class="text-2xl">Forgot your password?</Card.Title>
			<Card.Description
				>Enter the email you sign in with and we will send you a link to choose a new one.</Card.Description
			>
		</Card.Header>
		<Card.Content>
			{#if sent}
				<div class="flex flex-col items-center gap-3 py-4 text-center">
					<MailCheck class="size-10 text-primary" />
					<p>If that email has an account, a reset link is on its way.</p>
					<p class="text-sm text-muted-foreground">
						It works for one hour. Check the spam folder if it is not in your inbox. No email? Your
						business owner can also set a new password for you from the Users screen.
					</p>
				</div>
			{:else}
				<form method="POST" use:enhance class="flex flex-col gap-4">
					<InputComp {form} {errors} name="email" type="email" label="Email" required />
					<Button type="submit" class="w-full">
						{#if $delayed}<LoadingBtn name="Sending" />{:else}Send reset link{/if}
					</Button>
				</form>
			{/if}
		</Card.Content>
		<Card.Footer class="text-sm text-muted-foreground">
			<a href={resolve('/login')} class="underline">Back to sign in</a>
		</Card.Footer>
	</Card.Root>
</div>
