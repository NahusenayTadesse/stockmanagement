<script lang="ts">
	import { m } from '$lib/paraglide/messages.js';
	import Plus from '@lucide/svelte/icons/plus';
	import { Button } from '@nahu/admin-kit/components/ui/button/index.js';
	import FormCard from '@nahu/admin-kit/formComponents/FormCard.svelte';
	import InputComp from '@nahu/admin-kit/formComponents/InputComp.svelte';
	import LoadingBtn from '@nahu/admin-kit/formComponents/LoadingBtn.svelte';
	import Errors from '@nahu/admin-kit/formComponents/Errors.svelte';
	import { createForm } from '@nahu/admin-kit/forms/createForm';
	import { roleSchema } from '$lib/schemas/users';

	let { data } = $props();

	// svelte-ignore state_referenced_locally
	const { form, errors, enhance, delayed, allErrors } = createForm(data.form, roleSchema, {
		dataType: 'json'
	});
</script>

<svelte:head>
	<title>{m.admin_roles_add()}</title>
</svelte:head>

<FormCard title={m.admin_roles_add()}>
	<form use:enhance action="?/add" id="main" class="flex flex-col gap-4" method="POST">
		<Errors allErrors={$allErrors} />
		<InputComp
			label={m.common_name()}
			name="name"
			{form}
			{errors}
			placeholder={m.admin_roles_name_placeholder()}
			required
		/>
		<InputComp
			label={m.admin_roles_description()}
			name="description"
			type="textarea"
			rows={3}
			{form}
			{errors}
		/>
		<InputComp
			label={m.admin_users_permissions()}
			name="permissions"
			type="checkbox"
			{form}
			{errors}
			items={data.allPermissions}
		/>
		<Button type="submit" form="main">
			{#if $delayed}<LoadingBtn name={m.admin_roles_adding()} />{:else}<Plus />
				{m.admin_roles_add()}{/if}
		</Button>
	</form>
</FormCard>
