<script lang="ts">
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
		{ name: 'Name', value: data.role.name },
		{ name: 'Description', value: data.role.description },
		{ name: 'Users', value: data.userList.length },
		{
			name: 'Permissions',
			value: data.role.isOwner ? 'All, always' : data.permissionList.length
		}
	]);
</script>

<svelte:head>
	<title>{data.role.name} · Role</title>
</svelte:head>

<SingleView title="Role: {data.role.name}">
	<div class="flex w-full flex-wrap gap-2 p-4">
		{#if !data.role.isOwner}
			<Button onclick={() => (editing = !editing)}>
				{#if editing}<ArrowLeft /> Back{:else}<Pencil /> Edit{/if}
			</Button>
			{#if data.userList.length === 0}
				<DeleteEntity
					entity="Role"
					name={data.role.name}
					consequence="Its permission grants go with it."
					canDelete={data.isSuperAdmin}
				/>
			{/if}
		{:else}
			<p class="text-sm text-muted-foreground">
				The owner role holds every permission, including new ones as they are added, and cannot be
				edited or deleted.
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
			<InputComp label="Name" name="name" {form} {errors} required />
			<InputComp label="Description" name="description" type="textarea" rows={3} {form} {errors} />
			<InputComp
				label="Permissions"
				name="permissions"
				type="checkbox"
				{form}
				{errors}
				items={data.allPermissions}
			/>
			<Button type="submit" form="edit">
				{#if $delayed}<LoadingBtn name="Saving" />{:else}<Save /> Save changes{/if}
			</Button>
		</form>
	{:else}
		<div class="w-full p-4"><SingleTable singleTable={details} /></div>
	{/if}
</SingleView>

<div class="mt-8 grid gap-8 lg:grid-cols-2">
	<section>
		<h2 class="mb-2 text-lg font-semibold">Permissions</h2>
		<ul class="divide-y rounded-md border">
			{#each data.permissionList as permission (permission.id)}
				<li class="px-4 py-2">
					<p>{permission.description ?? permission.name}</p>
					<p class="font-mono text-xs text-muted-foreground">{permission.name}</p>
				</li>
			{:else}
				<li class="px-4 py-2 text-muted-foreground">None</li>
			{/each}
		</ul>
	</section>
	<section>
		<h2 class="mb-2 text-lg font-semibold">Users on this role</h2>
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
				<li class="px-4 py-2 text-muted-foreground">Nobody</li>
			{/each}
		</ul>
	</section>
</div>
