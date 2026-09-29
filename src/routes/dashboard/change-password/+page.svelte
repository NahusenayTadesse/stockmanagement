<script lang="ts">
	import { m } from '$lib/paraglide/messages.js';
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
	<title>{m.admin_change_title()}</title>
</svelte:head>

<FormCard title={m.admin_change_title()}>
	<form use:enhance action="?/changePassword" id="main" class="flex flex-col gap-4" method="POST">
		<Errors allErrors={$allErrors} />
		<InputComp
			{form}
			{errors}
			name="currentPassword"
			type="password"
			label={m.admin_change_current()}
			required
		/>
		<InputComp
			{form}
			{errors}
			name="newPassword"
			type="password"
			label={m.admin_reset_new_password()}
			required
		/>
		<InputComp
			{form}
			{errors}
			name="confirmPassword"
			type="password"
			label={m.admin_change_confirm()}
			required
		/>
		<Button type="submit" form="main">
			{#if $delayed}<LoadingBtn name={m.admin_change_changing()} />{:else}<KeyRound />
				{m.admin_change_title()}{/if}
		</Button>
	</form>
</FormCard>
