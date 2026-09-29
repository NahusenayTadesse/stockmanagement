import { superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { redirect } from 'sveltekit-flash-message/server';
import { isDuplicateKey } from '@nahu/admin-kit/server/dbErrors';
import { db } from '$lib/server/db';
import { rolePermissions, roles } from '$lib/server/db/schema';
import { orgIdOf } from '$lib/server/tenant';
import { permissionOptions, ungrantable } from '$lib/server/users';
import { roleSchema } from '$lib/schemas/users';
import type { Actions, PageServerLoad } from './$types';
import { m } from '$lib/paraglide/messages.js';
import { invalidForm, refuseForm } from '$lib/server/actions';

export const load: PageServerLoad = async () => ({
	form: await superValidate(zod4(roleSchema)),
	allPermissions: await permissionOptions()
});

export const actions: Actions = {
	add: async (event) => {
		const orgId = orgIdOf(event.locals);
		const form = await superValidate(event.request, zod4(roleSchema));
		if (!form.valid) return invalidForm(form);

		const refused = await ungrantable(event.locals, form.data.permissions);
		if (refused === null || refused.length) {
			const text = refused
				? m.admin_users_cannot_grant({ names: refused.join(', ') })
				: m.admin_users_choose_permissions();
			return refuseForm(form, text, { field: 'permissions._errors', status: 403 });
		}

		let id: number;
		try {
			id = await db.transaction(async (tx) => {
				const [role] = await tx
					.insert(roles)
					.values({ orgId, name: form.data.name, description: form.data.description || null })
					.$returningId();
				await tx.insert(rolePermissions).values(
					form.data.permissions.map((permissionId) => ({
						roleId: role.id,
						permissionId,
						createdBy: event.locals.user?.id
					}))
				);
				return role.id;
			});
		} catch (err) {
			if (isDuplicateKey(err)) {
				return refuseForm(form, m.admin_roles_exists(), {
					field: 'name',
					fieldText: m.admin_roles_name_exists(),
					status: 409
				});
			}
			console.error('role create failed', err);
			return refuseForm(form, m.admin_roles_add_failed(), { status: 500 });
		}

		redirect(
			`/dashboard/admin-panel/roles/${id}`,
			{ type: 'success', message: m.admin_roles_added() },
			event.cookies
		);
	}
};
