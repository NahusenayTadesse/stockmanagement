<script lang="ts">
	import { m } from '$lib/paraglide/messages.js';
	import { resolve } from '$app/paths';
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';
	import Pencil from '@lucide/svelte/icons/pencil';
	import Save from '@lucide/svelte/icons/save';
	import SingleView from '@nahu/admin-kit/components/SingleView.svelte';
	import SingleTable from '@nahu/admin-kit/components/SingleTable.svelte';
	import DeleteEntity from '@nahu/admin-kit/components/DeleteEntity.svelte';
	import { Button } from '@nahu/admin-kit/components/ui/button/index.js';
	import InputComp from '@nahu/admin-kit/formComponents/InputComp.svelte';
	import LoadingBtn from '@nahu/admin-kit/formComponents/LoadingBtn.svelte';
	import Errors from '@nahu/admin-kit/formComponents/Errors.svelte';
	import { createForm } from '@nahu/admin-kit/forms/createForm';
	import { roleSchema } from '$lib/schemas/users';

	let { data } = $props();

	// svelte-ignore state_referenced_locally
	const { form, errors, enhance, delayed, allErrors } = createForm(data.form, roleSchema, {
		dataType: 'json',
		resetForm: false,
		onUpdated({ form }) {
			if (form.message?.type === 'success') editing = false;
		}
	});

	let editing = $state(false);

	const details = $derived([
		{ name: m.common_name(), value: data.role.name },
		{ name: m.admin_roles_description(), value: data.role.description },
		{ name: m.admin_users_title(), value: data.userList.length },
		{
			name: m.admin_users_permissions(),
			value: data.role.isOwner ? m.admin_roles_all_always() : data.permissionList.length
		}
	]);
</script>

<svelte:head>
	<title>{m.admin_roles_title_one({ name: data.role.name })}</title>
</svelte:head>

<SingleView title={m.admin_roles_view_title({ name: data.role.name })}>
	<div class="flex w-full flex-wrap gap-2 p-4">
		{#if !data.role.isOwner}
			<Button onclick={() => (editing = !editing)}>
				{#if editing}<ArrowLeft /> {m.common_back()}{:else}<Pencil /> {m.common_edit()}{/if}
			</Button>
			{#if data.userList.length === 0}
				<DeleteEntity
					entity={m.admin_roles_entity()}
					name={data.role.name}
					consequence={m.admin_roles_delete_consequence()}
					canDelete={data.isSuperAdmin}
				/>
			{/if}
		{:else}
			<p class="text-sm text-muted-foreground">
				{m.admin_roles_owner_note()}
			</p>
		{/if}
	</div>

	{#if editing}
		<form
			use:enhance
			action="?/edit"
			id="edit"
			class="flex w-full flex-col gap-4 p-4"
			method="POST"
		>
			<Errors allErrors={$allErrors} />
			<InputComp label={m.common_name()} name="name" {form} {errors} required />
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
			<Button type="submit" form="edit">
				{#if $delayed}<LoadingBtn name={m.common_saving()} />{:else}<Save />
					{m.admin_save_changes()}{/if}
			</Button>
		</form>
	{:else}
		<div class="w-full p-4"><SingleTable singleTable={details} /></div>
	{/if}
</SingleView>

<div class="mt-8 grid gap-8 lg:grid-cols-2">
	<section>
		<h2 class="mb-2 text-lg font-semibold">{m.admin_users_permissions()}</h2>
		<ul class="divide-y rounded-md border">
			{#each data.permissionList as permission (permission.id)}
				<li class="px-4 py-2">
					<p>{permission.description ?? permission.name}</p>
					<p class="font-mono text-xs text-muted-foreground">{permission.name}</p>
				</li>
			{:else}
				<li class="px-4 py-2 text-muted-foreground">{m.common_none()}</li>
			{/each}
		</ul>
	</section>
	<section>
		<h2 class="mb-2 text-lg font-semibold">{m.admin_roles_on_this()}</h2>
		<ul class="divide-y rounded-md border">
			{#each data.userList as person (person.id)}
				<li class="flex justify-between px-4 py-2">
					<a
						class="hover:underline"
						href={resolve('/dashboard/admin-panel/users/[id]', { id: person.id })}>{person.name}</a
					>
					<span class="text-sm text-muted-foreground">{person.email}</span>
				</li>
			{:else}
				<li class="px-4 py-2 text-muted-foreground">{m.admin_roles_nobody()}</li>
			{/each}
		</ul>
	</section>
</div>
