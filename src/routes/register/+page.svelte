<script lang="ts">
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
	<title>Register your business</title>
</svelte:head>

<div class="flex min-h-dvh w-full items-center justify-center px-4 py-8">
	<Card.Root class="w-full max-w-lg">
		<Card.Header>
			<Card.Title class="flex flex-row items-center justify-between text-2xl">
				Register your business <DarkMode />
			</Card.Title>
			<Card.Description>
				You become its owner, with every permission. A main branch, a main store and the usual units
				(piece, box, kg, quintal, litre…) are set up for you.
			</Card.Description>
		</Card.Header>
		<Card.Content>
			<form method="POST" action="?/register" use:enhance class="flex flex-col gap-4">
				<Errors allErrors={$allErrors} />

				<fieldset class="flex flex-col gap-4">
					<legend class="mb-2 text-sm font-semibold text-muted-foreground">Business</legend>
					<InputComp {form} {errors} name="business" label="Business name" required />
					<InputComp
						{form}
						{errors}
						name="tin"
						label="TIN"
						placeholder="10 digits, optional"
						description="Printed on your documents."
					/>
					<InputComp {form} {errors} name="phone" type="tel" label="Phone" />
				</fieldset>

				<fieldset class="flex flex-col gap-4">
					<legend class="mb-2 text-sm font-semibold text-muted-foreground">You</legend>
					<InputComp {form} {errors} name="name" label="Your name" required />
					<InputComp {form} {errors} name="email" type="email" label="Email" required />
					<InputComp {form} {errors} name="password" type="password" label="Password" required />
				</fieldset>

				<Button type="submit" class="w-full">
					{#if $delayed}<LoadingBtn name="Setting up" />{:else}Create business{/if}
				</Button>
			</form>
		</Card.Content>
		<Card.Footer class="text-sm text-muted-foreground">
			Already registered?&nbsp;<a href={resolve('/login')} class="underline">Sign in</a>.
		</Card.Footer>
	</Card.Root>
</div>
