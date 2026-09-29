<script lang="ts">
	import { m } from '$lib/paraglide/messages.js';
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
	<title>{m.admin_users_add()}</title>
</svelte:head>

<FormCard title={m.admin_users_add()} description={m.admin_users_add_desc()}>
	<form use:enhance action="?/addUser" id="main" class="flex flex-col gap-4" method="POST">
		<Errors allErrors={$allErrors} />
		<InputComp {form} {errors} name="name" label={m.common_name()} required />
		<InputComp {form} {errors} name="email" type="email" label={m.common_email()} required />
		<InputComp
			{form}
			{errors}
			name="password"
			type="password"
			label={m.admin_login_password()}
			required
		/>
		<div class="max-w-sm">
			<PasswordGenerator bind:password={$form.password} />
		</div>
		<InputComp
			{form}
			{errors}
			name="role"
			type="select"
			label={m.admin_users_col_role()}
			items={data.roleList}
			required
		/>
		<InputComp
			{form}
			{errors}
			name="branchId"
			type="select"
			label={m.admin_users_col_home_branch()}
			items={data.branchList}
			description={m.admin_users_home_branch_desc()}
		/>
		{#if data.branchChoices.length > 1}
			<InputComp
				{form}
				{errors}
				name="branchIds"
				type="checkbox"
				label={m.admin_users_works_in_optional()}
				items={data.branchChoices}
				description={m.admin_users_works_in_desc()}
			/>
		{/if}
		<Button type="submit" form="main">
			{#if $delayed}<LoadingBtn name={m.admin_users_adding()} />{:else}<Plus />
				{m.admin_users_add()}{/if}
		</Button>
	</form>
</FormCard>
