<script lang="ts">
	import PageSection from '@nahu/admin-kit/components/PageSection.svelte';
	import type { ColumnDef } from '@tanstack/table-core';
	import { m } from '$lib/paraglide/messages.js';
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
	import DataTable from '@nahu/admin-kit/components/Table/data-table.svelte';
	import { roleSchema } from '$lib/schemas/users';
	import { textColumn } from '$lib/table';
	import { recordLink } from '$lib/table';
	import PermissionTable from '../../PermissionTable.svelte';

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
		{ name: m.admin_roles_description(), value: data.role.description, long: 120 },
		{ name: m.admin_users_title(), value: data.userList.length },
		{
			name: m.admin_users_permissions(),
			value: data.role.isOwner ? m.admin_roles_all_always() : data.permissionList.length
		}
	]);

	type Person = (typeof data.userList)[number];
	const peopleColumns: ColumnDef<Person>[] = [
		{
			accessorKey: 'name',
			header: () => m.common_name(),
			cell: ({ row }) => recordLink('user', row.original.id, row.original.name)
		},
		textColumn('email', m.common_email)
	];
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
	<PermissionTable
		title={m.admin_users_permissions()}
		permissions={data.permissionList.map((p) => ({
			key: p.id,
			words: p.description ?? p.name,
			code: p.name
		}))}
		empty={m.common_none()}
	/>
	<PageSection title={m.admin_roles_on_this()}>
		{#if data.userList.length}
			<DataTable variant="compact" data={data.userList} columns={peopleColumns} />
		{:else}
			<p class="rounded-md border px-4 py-2 text-muted-foreground">{m.admin_roles_nobody()}</p>
		{/if}
	</PageSection>
</div>
