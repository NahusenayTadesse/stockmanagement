import { error, fail } from '@sveltejs/kit';
import { and, count, eq } from 'drizzle-orm';
import { message, setError, superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { redirect, setFlash } from 'sveltekit-flash-message/server';
import { isDuplicateKey } from '@nahu/admin-kit/server/dbErrors';
import { notDeleted, deletionStamp } from '@nahu/admin-kit/server/softDelete';
import { requireSuperAdmin } from '@nahu/admin-kit/server/permissions';
import { db } from '$lib/server/db';
import { permissions, rolePermissions, roles, user } from '$lib/server/db/schema';
import { orgIdOf } from '$lib/server/tenant';
import { orgRole, permissionOptions, ungrantable } from '$lib/server/users';
import { roleSchema } from '$lib/schemas/users';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
	const orgId = orgIdOf(locals);
	const role = await orgRole(orgId, Number(params.id));
	if (!role) error(404, 'Role not found');

	const [permissionList, userList, allPermissions] = await Promise.all([
		db
			.select({ id: permissions.id, name: permissions.name, description: permissions.description })
			.from(permissions)
			.innerJoin(
				rolePermissions,
				and(eq(permissions.id, rolePermissions.permissionId), notDeleted(rolePermissions))
			)
			.where(eq(rolePermissions.roleId, role.id))
			.orderBy(permissions.name),
		db
			.select({ id: user.id, name: user.name, email: user.email, isActive: user.isActive })
			.from(user)
			.where(and(eq(user.roleId, role.id), eq(user.orgId, orgId), notDeleted(user))),
		permissionOptions()
	]);

	const form = await superValidate(
		{
			name: role.name,
			description: role.description ?? '',
			permissions: permissionList.map((p) => p.id)
		},
		zod4(roleSchema),
		{ errors: false }
	);

	return { role, permissionList, userList, allPermissions, form };
};

export const actions: Actions = {
	edit: async (event) => {
		const orgId = orgIdOf(event.locals);
		const form = await superValidate(event.request, zod4(roleSchema));
		if (!form.valid) {
			return message(form, { type: 'error', text: 'Please check the form' }, { status: 400 });
		}

		const role = await orgRole(orgId, Number(event.params.id));
		if (!role) error(404, 'Role not found');
		if (role.isOwner) {
			return message(
				form,
				{
					type: 'error',
					text: 'The owner role always holds every permission and cannot be changed.'
				},
				{ status: 409 }
			);
		}

		const refused = await ungrantable(event.locals, form.data.permissions);
		if (refused === null || refused.length) {
			const text = refused
				? `You cannot grant permissions you do not hold: ${refused.join(', ')}`
				: 'Choose permissions from the list.';
			setError(form, 'permissions._errors', text);
			return message(form, { type: 'error', text }, { status: 403 });
		}

		try {
			// One transaction: a failure half way must not leave the role with no permissions.
			await db.transaction(async (tx) => {
				await tx
					.update(roles)
					.set({ name: form.data.name, description: form.data.description || null })
					.where(eq(roles.id, role.id));
				await tx.delete(rolePermissions).where(eq(rolePermissions.roleId, role.id));
				await tx.insert(rolePermissions).values(
					form.data.permissions.map((permissionId) => ({
						roleId: role.id,
						permissionId,
						createdBy: event.locals.user?.id
					}))
				);
			});
		} catch (err) {
			if (isDuplicateKey(err)) {
				setError(form, 'name', 'A role with this name already exists.');
				return message(form, { type: 'error', text: 'That role already exists.' }, { status: 409 });
			}
			console.error('role update failed', err);
			return message(form, { type: 'error', text: 'Could not save the role.' }, { status: 500 });
		}

		return message(form, { type: 'success', text: 'Role saved' });
	},

	/** Soft delete, super admin only. Refused while anyone holds the role, and for the owner role. */
	delete: async ({ params, locals, cookies }) => {
		requireSuperAdmin(locals);
		const orgId = orgIdOf(locals);
		const role = await orgRole(orgId, Number(params.id));
		if (!role) error(404, 'Role not found');

		if (role.isOwner) {
			setFlash({ type: 'error', message: 'The owner role cannot be deleted.' }, cookies);
			return fail(409);
		}

		const [{ holders }] = await db
			.select({ holders: count() })
			.from(user)
			.where(and(eq(user.roleId, role.id), notDeleted(user)));
		if (holders > 0) {
			setFlash(
				{
					type: 'error',
					message: `${holders} user${holders === 1 ? ' is' : 's are'} still on this role. Move them to another role first.`
				},
				cookies
			);
			return fail(409);
		}

		await db
			.update(roles)
			.set(deletionStamp(locals.user?.id) as never)
			.where(eq(roles.id, role.id));

		redirect('/dashboard/admin-panel/roles', { type: 'success', message: 'Role deleted' }, cookies);
	}
};
