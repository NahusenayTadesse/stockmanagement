<script lang="ts">
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
		{ name: 'Name', value: data.person.name },
		{ name: 'Email', value: data.person.email },
		{
			name: 'Role',
			value: data.person.role,
			href: `/dashboard/admin-panel/roles/${data.person.roleId}`
		},
		{ name: 'Branch', value: data.person.branch ?? 'Any branch' },
		{ name: 'Status', value: data.person.status ? 'Active' : 'Inactive' },
		{
			name: 'Permissions',
			value: data.custom ? 'Their own (replacing the role’s)' : 'From their role'
		},
		{ name: 'Added', value: formatEthiopianDate(new Date(data.person.createdAt)) }
	]);
</script>

<svelte:head>
	<title>{data.person.name} · User</title>
</svelte:head>

<SingleView title={data.person.name}>
	<div class="flex w-full flex-wrap gap-2 p-4">
		<Button onclick={() => (editing = !editing)}>
			{#if editing}<ArrowLeft /> Back{:else}<Pencil /> Edit{/if}
		</Button>

		<DialogComp
			bind:open={resetOpen}
			title="Set a new password"
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
					{data.person.name} is signed out everywhere and signs in again with this password.
				</p>
				<InputComp
					form={resetData}
					errors={resetErrors}
					name="password"
					type="password"
					label="New password"
					required
				/>
				<PasswordGenerator bind:password={$resetData.password} />
				<Button type="submit" form="reset">
					{#if $resetDelayed}<LoadingBtn name="Saving" />{:else}Set password{/if}
				</Button>
			</form>
		</DialogComp>

		<DeleteEntity
			entity="User"
			name={data.person.name}
			consequence="They are signed out everywhere and can no longer sign in. What they recorded stays, under their name."
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
				Saving signs {isSelf ? 'nobody' : data.person.name} out of every device, so the change applies
				straight away.
			</p>
			<Errors allErrors={$allErrors} />
			<InputComp {form} {errors} name="name" label="Name" required />
			<InputComp {form} {errors} name="email" type="email" label="Email" required />
			<InputComp {form} {errors} name="role" type="select" label="Role" items={data.roleList} />
			<InputComp
				{form}
				{errors}
				name="branchId"
				type="select"
				label="Branch"
				items={data.branchList}
			/>
			<InputComp
				{form}
				{errors}
				name="status"
				type="select"
				label="Status"
				items={[
					{ value: true, name: 'Active' },
					{ value: false, name: 'Inactive — cannot sign in' }
				]}
			/>
			<InputComp
				{form}
				{errors}
				name="editPermission"
				type="checkboxSingle"
				label="Own permissions"
				placeholder="Give this user their own permissions instead of the role’s"
			/>
			{#if $form.editPermission}
				<InputComp
					{form}
					{errors}
					name="permissionsList"
					type="checkbox"
					label="Permissions"
					items={data.allPerms}
				/>
			{/if}
			<Button type="submit" form="edit">
				{#if $delayed}<LoadingBtn name="Saving" />{:else}<Save /> Save changes{/if}
			</Button>
		</form>
	{:else}
		<div class="w-full p-4"><SingleTable singleTable={details} /></div>
	{/if}
</SingleView>

<section class="mt-8">
	<h2 class="mb-2 text-lg font-semibold">What {data.person.name} may do</h2>
	<ul class="divide-y rounded-md border">
		{#each data.permissionList as permission (permission.value)}
			<li class="px-4 py-2">
				<p>{permission.name}</p>
				<p class="font-mono text-xs text-muted-foreground">{permission.description}</p>
			</li>
		{:else}
			<li class="px-4 py-2 text-muted-foreground">Nothing</li>
		{/each}
	</ul>
</section>
