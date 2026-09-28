import { message, setError, superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { redirect } from 'sveltekit-flash-message/server';
import { isDuplicateKey } from '@nahu/admin-kit/server/dbErrors';
import { db } from '$lib/server/db';
import { rolePermissions, roles } from '$lib/server/db/schema';
import { orgIdOf } from '$lib/server/tenant';
import { permissionOptions, ungrantable } from '$lib/server/users';
import { roleSchema } from '$lib/schemas/users';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async () => ({
	form: await superValidate(zod4(roleSchema)),
	allPermissions: await permissionOptions()
});

export const actions: Actions = {
	add: async (event) => {
		const orgId = orgIdOf(event.locals);
		const form = await superValidate(event.request, zod4(roleSchema));
		if (!form.valid) {
			return message(form, { type: 'error', text: 'Please check the form' }, { status: 400 });
		}

		const refused = await ungrantable(event.locals, form.data.permissions);
		if (refused === null || refused.length) {
			const text = refused
				? `You cannot grant permissions you do not hold: ${refused.join(', ')}`
				: 'Choose permissions from the list.';
			setError(form, 'permissions._errors', text);
			return message(form, { type: 'error', text }, { status: 403 });
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
				setError(form, 'name', 'A role with this name already exists.');
				return message(form, { type: 'error', text: 'That role already exists.' }, { status: 409 });
			}
			console.error('role create failed', err);
			return message(form, { type: 'error', text: 'Could not add the role.' }, { status: 500 });
		}

		redirect(
			`/dashboard/admin-panel/roles/${id}`,
			{ type: 'success', message: 'Role added' },
			event.cookies
		);
	}
};
