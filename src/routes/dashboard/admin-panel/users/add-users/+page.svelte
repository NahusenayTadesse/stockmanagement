<script lang="ts">
	import Plus from '@lucide/svelte/icons/plus';
	import { Button } from '@nahu/admin-kit/components/ui/button/index.js';
	import FormCard from '@nahu/admin-kit/formComponents/FormCard.svelte';
	import InputComp from '@nahu/admin-kit/formComponents/InputComp.svelte';
	import LoadingBtn from '@nahu/admin-kit/formComponents/LoadingBtn.svelte';
	import Errors from '@nahu/admin-kit/formComponents/Errors.svelte';
	import PasswordGenerator from '@nahu/admin-kit/components/PasswordGenerator.svelte';
	import { createForm } from '@nahu/admin-kit/forms/createForm';
	import { addUserSchema } from '$lib/schemas/users';

	let { data } = $props();

	// svelte-ignore state_referenced_locally
	const { form, errors, enhance, delayed, allErrors } = createForm(data.form, addUserSchema, {
		dataType: 'json'
	});
</script>

<svelte:head>
	<title>Add user</title>
</svelte:head>

<FormCard title="Add user" description="They sign in with this email and password.">
	<form use:enhance action="?/addUser" id="main" class="flex flex-col gap-4" method="POST">
		<Errors allErrors={$allErrors} />
		<InputComp {form} {errors} name="name" label="Name" required />
		<InputComp {form} {errors} name="email" type="email" label="Email" required />
		<InputComp {form} {errors} name="password" type="password" label="Password" required />
		<div class="max-w-sm">
			<PasswordGenerator bind:password={$form.password} />
		</div>
		<InputComp
			{form}
			{errors}
			name="role"
			type="select"
			label="Role"
			items={data.roleList}
			required
		/>
		<InputComp
			{form}
			{errors}
			name="branchId"
			type="select"
			label="Home branch"
			items={data.branchList}
			description="Where they usually work: the default on their forms."
		/>
		{#if data.branchChoices.length > 1}
			<InputComp
				{form}
				{errors}
				name="branchIds"
				type="checkbox"
				label="Works in (optional)"
				items={data.branchChoices}
				description="Tick the branches whose stock they may see and move. None ticked: every branch. Owners and managers (who may work in every branch) see everything anyway."
			/>
		{/if}
		<Button type="submit" form="main">
			{#if $delayed}<LoadingBtn name="Adding user" />{:else}<Plus /> Add user{/if}
		</Button>
	</form>
</FormCard>
