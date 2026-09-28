import { eq } from 'drizzle-orm';
import { message, setError, superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { redirect } from 'sveltekit-flash-message/server';
import { APIError } from 'better-auth/api';
import { auth } from '$lib/server/auth';
import { db } from '$lib/server/db';
import { branch, user } from '$lib/server/db/schema';
import { orgIdOf } from '$lib/server/tenant';
import { branchOptions, roleOptions } from '$lib/server/options';
import { orgRole } from '$lib/server/users';
import { addUserSchema } from '$lib/schemas/users';
import type { Actions, PageServerLoad } from './$types';
import { and } from 'drizzle-orm';

export const load: PageServerLoad = async ({ locals }) => {
	const orgId = orgIdOf(locals);
	const [form, roleList, branchList] = await Promise.all([
		superValidate(zod4(addUserSchema)),
		roleOptions(orgId),
		branchOptions(orgId)
	]);
	return { form, roleList, branchList: [{ value: 0, name: 'Any branch' }, ...branchList] };
};

export const actions: Actions = {
	/**
	 * Creates a staff account in the viewer's business. Through better-auth's `createUser`, called
	 * without request headers — so the password is hashed the one way the system knows, and no
	 * session is opened for the new user.
	 */
	addUser: async (event) => {
		const orgId = orgIdOf(event.locals);
		const form = await superValidate(event.request, zod4(addUserSchema));
		if (!form.valid) {
			return message(form, { type: 'error', text: 'Please check the form' }, { status: 400 });
		}

		const { name, email, password, role, branchId } = form.data;

		const target = await orgRole(orgId, role);
		if (!target) {
			setError(form, 'role', 'Choose a role from the list.');
			return message(
				form,
				{ type: 'error', text: 'Choose a role from the list.' },
				{ status: 400 }
			);
		}
		// Only an owner can make another owner: the owner role holds every permission.
		if (target.isOwner && !event.locals.isSuperAdmin) {
			setError(form, 'role', 'Only an owner can add another owner.');
			return message(
				form,
				{ type: 'error', text: 'Only an owner can add another owner.' },
				{ status: 403 }
			);
		}
		if (branchId) {
			const [b] = await db
				.select({ id: branch.id })
				.from(branch)
				.where(and(eq(branch.id, branchId), eq(branch.orgId, orgId)));
			if (!b) {
				setError(form, 'branchId', 'Choose a branch from the list.');
				return message(
					form,
					{ type: 'error', text: 'Choose a branch from the list.' },
					{ status: 400 }
				);
			}
		}

		const [taken] = await db.select({ id: user.id }).from(user).where(eq(user.email, email));
		if (taken) {
			setError(form, 'email', 'An account with this email already exists.');
			return message(
				form,
				{ type: 'error', text: 'That email is already in use.' },
				{ status: 409 }
			);
		}

		let id: string;
		try {
			const created = await auth.api.createUser({
				body: {
					email,
					password,
					name,
					role: 'user',
					data: { orgId, roleId: role, branchId: branchId || null }
				}
			});
			id = created.user.id;
		} catch (err) {
			console.error('user create failed', err);
			const text =
				err instanceof APIError && err.message ? err.message : 'Could not create the user.';
			return message(form, { type: 'error', text }, { status: 500 });
		}

		redirect(
			`/dashboard/admin-panel/users/${id}`,
			{ type: 'success', message: `${name} can now sign in` },
			event.cookies
		);
	}
};
