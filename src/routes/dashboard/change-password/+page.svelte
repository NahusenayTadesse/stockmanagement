<script lang="ts">
	import KeyRound from '@lucide/svelte/icons/key-round';
	import { Button } from '@nahu/admin-kit/components/ui/button/index.js';
	import FormCard from '@nahu/admin-kit/formComponents/FormCard.svelte';
	import InputComp from '@nahu/admin-kit/formComponents/InputComp.svelte';
	import LoadingBtn from '@nahu/admin-kit/formComponents/LoadingBtn.svelte';
	import Errors from '@nahu/admin-kit/formComponents/Errors.svelte';
	import { createForm } from '@nahu/admin-kit/forms/createForm';
	import { changePasswordSchema } from '$lib/schemas/users';

	let { data } = $props();

	// svelte-ignore state_referenced_locally
	const { form, errors, enhance, delayed, allErrors } = createForm(
		data.form,
		changePasswordSchema,
		{
			resetForm: true
		}
	);
</script>

<svelte:head>
	<title>Change password</title>
</svelte:head>

<FormCard title="Change password">
	<form use:enhance action="?/changePassword" id="main" class="flex flex-col gap-4" method="POST">
		<Errors allErrors={$allErrors} />
		<InputComp
			{form}
			{errors}
			name="currentPassword"
			type="password"
			label="Current password"
			required
		/>
		<InputComp {form} {errors} name="newPassword" type="password" label="New password" required />
		<InputComp
			{form}
			{errors}
			name="confirmPassword"
			type="password"
			label="Confirm new password"
			required
		/>
		<Button type="submit" form="main">
			{#if $delayed}<LoadingBtn name="Changing password" />{:else}<KeyRound /> Change password{/if}
		</Button>
	</form>
</FormCard>
