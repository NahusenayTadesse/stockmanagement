<script lang="ts">
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
	<title>Choose a new password</title>
</svelte:head>

<div class="flex min-h-dvh w-full items-center justify-center px-4">
	<Card.Root class="w-full max-w-md">
		<Card.Header>
			<Card.Title class="text-2xl">Choose a new password</Card.Title>
		</Card.Header>
		<Card.Content>
			{#if data.invalid}
				<p class="mb-4">This reset link has expired or was already used.</p>
				<Button href={resolve('/forgot-password')} class="w-full">Send a new link</Button>
			{:else}
				<form method="POST" use:enhance class="flex flex-col gap-4">
					<Errors allErrors={$allErrors} />
					<input type="hidden" name="token" value={$form.token} />
					<InputComp
						{form}
						{errors}
						name="password"
						type="password"
						label="New password"
						required
					/>
					<InputComp
						{form}
						{errors}
						name="confirm"
						type="password"
						label="Type it again"
						required
					/>
					<Button type="submit" class="w-full">
						{#if $delayed}<LoadingBtn name="Saving" />{:else}Set new password{/if}
					</Button>
				</form>
			{/if}
		</Card.Content>
		<Card.Footer class="text-sm text-muted-foreground">
			<a href={resolve('/login')} class="underline">Back to sign in</a>
		</Card.Footer>
	</Card.Root>
</div>
