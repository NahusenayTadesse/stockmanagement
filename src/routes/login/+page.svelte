<script lang="ts">
	import { resolve } from '$app/paths';
	import { Eye, EyeOff } from '@lucide/svelte';
	import { Button } from '@nahu/admin-kit/components/ui/button/index.js';
	import * as Card from '@nahu/admin-kit/components/ui/card/index.js';
	import { Input } from '@nahu/admin-kit/components/ui/input/index.js';
	import { Label } from '@nahu/admin-kit/components/ui/label/index.js';
	import Errors from '@nahu/admin-kit/formComponents/Errors.svelte';
	import LoadingBtn from '@nahu/admin-kit/formComponents/LoadingBtn.svelte';
	import DarkMode from '@nahu/admin-kit/components/shell/DarkMode.svelte';
	import { createForm } from '@nahu/admin-kit/forms/createForm';
	import { loginSchema } from '$lib/schemas/auth';

	let { data } = $props();

	// svelte-ignore state_referenced_locally
	const { form, errors, enhance, allErrors, delayed } = createForm(data.form, loginSchema);

	let showPassword = $state(false);
	const EyeIcon = $derived(showPassword ? EyeOff : Eye);
</script>

<svelte:head>
	<title>Sign in</title>
</svelte:head>

<div class="flex min-h-dvh w-full items-center justify-center px-4">
	<Card.Root class="w-full max-w-md">
		<Card.Header>
			<Card.Title class="flex flex-row items-center justify-between text-2xl">
				Sign in <DarkMode />
			</Card.Title>
			<Card.Description>Enter your email and password to open your stores.</Card.Description>
		</Card.Header>
		<Card.Content>
			<form method="POST" action="?/login" use:enhance class="grid gap-4">
				<Errors allErrors={$allErrors} />

				<div class="grid gap-2">
					<Label for="email">Email</Label>
					<Input
						id="email"
						name="email"
						type="email"
						autocomplete="username"
						placeholder="you@example.com"
						bind:value={$form.email}
						aria-invalid={$errors.email ? 'true' : undefined}
						required
					/>
					{#if $errors.email}<span class="text-sm text-destructive">{$errors.email}</span>{/if}
				</div>

				<div class="grid gap-2">
					<div class="flex items-center justify-between">
						<Label for="password">Password</Label>
						<a href={resolve('/forgot-password')} class="text-sm underline">Forgot your password?</a
						>
					</div>
					<div class="relative">
						<Input
							id="password"
							name="password"
							type={showPassword ? 'text' : 'password'}
							autocomplete="current-password"
							bind:value={$form.password}
							aria-invalid={$errors.password ? 'true' : undefined}
							required
						/>
						<button
							type="button"
							class="absolute top-1/2 right-2 -translate-y-1/2 text-muted-foreground"
							onclick={() => (showPassword = !showPassword)}
							aria-label={showPassword ? 'Hide password' : 'Show password'}
						>
							<EyeIcon class="size-5" />
						</button>
					</div>
					{#if $errors.password}
						<span class="text-sm text-destructive">{$errors.password}</span>
					{/if}
				</div>

				<Button type="submit" class="w-full">
					{#if $delayed}<LoadingBtn name="Signing in" />{:else}Sign in{/if}
				</Button>
			</form>
		</Card.Content>
		<Card.Footer class="text-sm text-muted-foreground">
			New business?&nbsp;<a href={resolve('/register')} class="underline">Register it here</a>.
		</Card.Footer>
	</Card.Root>
</div>
