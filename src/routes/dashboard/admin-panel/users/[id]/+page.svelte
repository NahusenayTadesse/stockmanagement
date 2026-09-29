<script lang="ts">
	import { m } from '$lib/paraglide/messages.js';
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';
	import KeyRound from '@lucide/svelte/icons/key-round';
	import Pencil from '@lucide/svelte/icons/pencil';
	import Save from '@lucide/svelte/icons/save';
	import SingleView from '@nahu/admin-kit/components/SingleView.svelte';
	import SingleTable from '@nahu/admin-kit/components/SingleTable.svelte';
	import DeleteEntity from '@nahu/admin-kit/components/DeleteEntity.svelte';
	import PasswordGenerator from '@nahu/admin-kit/components/PasswordGenerator.svelte';
	import { Button } from '@nahu/admin-kit/components/ui/button/index.js';
	import DialogComp from '@nahu/admin-kit/formComponents/DialogComp.svelte';
	import InputComp from '@nahu/admin-kit/formComponents/InputComp.svelte';
	import LoadingBtn from '@nahu/admin-kit/formComponents/LoadingBtn.svelte';
	import Errors from '@nahu/admin-kit/formComponents/Errors.svelte';
	import { createForm } from '@nahu/admin-kit/forms/createForm';
	import { formatEthiopianDate } from '@nahu/admin-kit/global';
	import { editUserSchema, resetPasswordSchema } from '$lib/schemas/users';
	import PermissionTable from '../../PermissionTable.svelte';

	let { data } = $props();

	let editing = $state(false);
	let resetOpen = $state(false);

	// svelte-ignore state_referenced_locally
	const { form, errors, enhance, delayed, allErrors } = createForm(data.form, editUserSchema, {
		dataType: 'json',
		resetForm: false,
		onUpdated({ form }) {
			if (form.message?.type === 'success') editing = false;
		}
	});

	// svelte-ignore state_referenced_locally
	const reset = createForm(data.passwordForm, resetPasswordSchema, {
		resetForm: true,
		onUpdated({ form }) {
			if (form.message?.type === 'success') resetOpen = false;
		}
	});
	const resetData = reset.form;
	const resetErrors = reset.errors;
	const resetDelayed = reset.delayed;

	const isSelf = $derived(data.person.id === data.user.id);

	const details = $derived([
		{ name: m.common_name(), value: data.person.name },
		{ name: m.common_email(), value: data.person.email },
		{
			name: m.admin_users_col_role(),
			value: data.person.role,
			href: `/dashboard/admin-panel/roles/${data.person.roleId}`
		},
		{
			name: m.admin_users_col_home_branch(),
			value: data.person.branch ?? m.admin_users_any_branch()
		},
		{
			name: m.admin_users_col_works_in(),
			value: data.worksIn.length ? data.worksIn.join(', ') : m.admin_users_all_branches()
		},
		{
			name: m.common_status(),
			kind: 'status' as const,
			value: data.person.status ? 'Active' : 'Inactive',
			label: data.person.status ? m.common_active() : m.common_inactive()
		},
		{
			name: m.admin_users_permissions(),
			value: data.custom ? m.admin_users_perms_own() : m.admin_users_perms_role()
		},
		{ name: m.admin_users_col_added(), value: formatEthiopianDate(new Date(data.person.createdAt)) }
	]);
</script>

<svelte:head>
	<title>{m.admin_users_title_one({ name: data.person.name })}</title>
</svelte:head>

<SingleView title={data.person.name}>
	<div class="flex w-full flex-wrap gap-2 p-4">
		<Button onclick={() => (editing = !editing)}>
			{#if editing}<ArrowLeft /> {m.common_back()}{:else}<Pencil /> {m.common_edit()}{/if}
		</Button>

		<DialogComp
			bind:open={resetOpen}
			title={m.admin_users_set_password()}
			variant="outline"
			IconComp={KeyRound}
		>
			<form
				method="POST"
				action="?/resetPassword"
				use:reset.enhance
				id="reset"
				class="flex flex-col gap-4"
			>
				<p class="text-sm text-muted-foreground">
					{m.admin_users_reset_desc({ name: data.person.name })}
				</p>
				<InputComp
					form={resetData}
					errors={resetErrors}
					name="password"
					type="password"
					label={m.admin_reset_new_password()}
					required
				/>
				<PasswordGenerator bind:password={$resetData.password} />
				<Button type="submit" form="reset">
					{#if $resetDelayed}<LoadingBtn
							name={m.common_saving()}
						/>{:else}{m.admin_users_set_password_btn()}{/if}
				</Button>
			</form>
		</DialogComp>

		<DeleteEntity
			entity={m.admin_users_entity()}
			name={data.person.name}
			consequence={m.admin_users_delete_consequence()}
			canDelete={data.isSuperAdmin && !isSelf}
		/>
	</div>

	{#if editing}
		<form
			action="?/editUser"
			use:enhance
			id="edit"
			class="flex w-full flex-col gap-4 p-4"
			method="POST"
		>
			<p class="text-sm text-muted-foreground">
				{m.admin_users_saving_signs_out({
					name: isSelf ? m.admin_users_nobody() : data.person.name
				})}
			</p>
			<Errors allErrors={$allErrors} />
			<InputComp {form} {errors} name="name" label={m.common_name()} required />
			<InputComp {form} {errors} name="email" type="email" label={m.common_email()} required />
			<InputComp
				{form}
				{errors}
				name="role"
				type="select"
				label={m.admin_users_col_role()}
				items={data.roleList}
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
					label={m.admin_users_col_works_in()}
					items={data.branchChoices}
					description={m.admin_users_works_in_desc()}
				/>
			{/if}
			<InputComp
				{form}
				{errors}
				name="status"
				type="select"
				label={m.common_status()}
				items={[
					{ value: true, name: m.common_active() },
					{ value: false, name: m.admin_users_inactive_no_signin() }
				]}
			/>
			<InputComp
				{form}
				{errors}
				name="editPermission"
				type="checkboxSingle"
				label={m.admin_users_own_perms()}
				placeholder={m.admin_users_own_perms_placeholder()}
			/>
			{#if $form.editPermission}
				<InputComp
					{form}
					{errors}
					name="permissionsList"
					type="checkbox"
					label={m.admin_users_permissions()}
					items={data.allPerms}
				/>
			{/if}
			<Button type="submit" form="edit">
				{#if $delayed}<LoadingBtn name={m.common_saving()} />{:else}<Save />
					{m.admin_save_changes()}{/if}
			</Button>
		</form>
	{:else}
		<div class="w-full p-4"><SingleTable singleTable={details} /></div>
	{/if}
</SingleView>

<div class="mt-8">
	<PermissionTable
		title={m.admin_users_may_do({ name: data.person.name })}
		permissions={data.permissionList.map((p) => ({
			key: p.value,
			words: p.name,
			code: p.description
		}))}
		empty={m.admin_nothing()}
	/>
</div>
