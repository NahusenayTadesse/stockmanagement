import { error } from '@sveltejs/kit';
import { and, count, eq } from 'drizzle-orm';
import { message, superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { redirect } from 'sveltekit-flash-message/server';
import { isDuplicateKey } from '@nahu/admin-kit/server/dbErrors';
import { notDeleted, deletionStamp } from '@nahu/admin-kit/server/softDelete';
import { requireSuperAdmin } from '@nahu/admin-kit/server/permissions';
import { db } from '$lib/server/db';
import { permissions, rolePermissions, roles, user } from '$lib/server/db/schema';
import { orgIdOf } from '$lib/server/tenant';
import { orgRole, permissionOptions, permissionWords, ungrantable } from '$lib/server/users';
import { roleSchema } from '$lib/schemas/users';
import type { Actions, PageServerLoad } from './$types';
import { m } from '$lib/paraglide/messages.js';
import { invalidForm, refuseAction, refuseForm } from '$lib/server/actions';

export const load: PageServerLoad = async ({ params, locals }) => {
	const orgId = orgIdOf(locals);
	const role = await orgRole(orgId, Number(params.id));
	if (!role) error(404, m.admin_roles_not_found());

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

	return {
		role,
		permissionList: permissionList.map((p) => ({
			...p,
			description: permissionWords(p.name, p.description)
		})),
		userList,
		allPermissions,
		form
	};
};

export const actions: Actions = {
	edit: async (event) => {
		const orgId = orgIdOf(event.locals);
		const form = await superValidate(event.request, zod4(roleSchema));
		if (!form.valid) return invalidForm(form);

		const role = await orgRole(orgId, Number(event.params.id));
		if (!role) error(404, m.admin_roles_not_found());
		if (role.isOwner) {
			return refuseForm(form, m.admin_roles_owner_fixed(), { status: 409 });
		}

		const refused = await ungrantable(event.locals, form.data.permissions);
		if (refused === null || refused.length) {
			const text = refused
				? m.admin_users_cannot_grant({ names: refused.join(', ') })
				: m.admin_users_choose_permissions();
			return refuseForm(form, text, { field: 'permissions._errors', status: 403 });
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
				return refuseForm(form, m.admin_roles_exists(), {
					field: 'name',
					fieldText: m.admin_roles_name_exists(),
					status: 409
				});
			}
			console.error('role update failed', err);
			return refuseForm(form, m.admin_roles_save_failed(), { status: 500 });
		}

		return message(form, { type: 'success', text: m.admin_roles_saved() });
	},

	/** Soft delete, super admin only. Refused while anyone holds the role, and for the owner role. */
	delete: async (event) => {
		const { params, locals, cookies } = event;
		requireSuperAdmin(locals);
		const orgId = orgIdOf(locals);
		const role = await orgRole(orgId, Number(params.id));
		if (!role) error(404, m.admin_roles_not_found());

		if (role.isOwner) return refuseAction(event, m.admin_roles_owner_no_delete());

		const [{ holders }] = await db
			.select({ holders: count() })
			.from(user)
			.where(and(eq(user.roleId, role.id), notDeleted(user)));
		if (holders > 0) return refuseAction(event, m.admin_roles_still_used({ count: holders }));

		await db
			.update(roles)
			.set(deletionStamp(locals.user?.id) as never)
			.where(eq(roles.id, role.id));

		redirect(
			'/dashboard/admin-panel/roles',
			{ type: 'success', message: m.admin_roles_deleted() },
			cookies
		);
	}
};
