import { eq } from 'drizzle-orm';
import { superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { redirect } from 'sveltekit-flash-message/server';
import { APIError } from 'better-auth/api';
import { auth } from '$lib/server/auth';
import { db } from '$lib/server/db';
import { branch, user } from '$lib/server/db/schema';
import { orgIdOf } from '$lib/server/tenant';
import { branchOptions, roleOptions } from '$lib/server/options';
import { orgRole, setUserBranches } from '$lib/server/users';
import { addUserSchema } from '$lib/schemas/users';
import type { Actions, PageServerLoad } from './$types';
import { and, inArray } from 'drizzle-orm';
import { m } from '$lib/paraglide/messages.js';
import { invalidForm, refuseForm } from '$lib/server/actions';

export const load: PageServerLoad = async ({ locals }) => {
	const orgId = orgIdOf(locals);
	const [form, roleList, branchList] = await Promise.all([
		superValidate(zod4(addUserSchema)),
		roleOptions(orgId),
		branchOptions(orgId)
	]);
	return {
		form,
		roleList,
		branchList: [{ value: 0, name: m.admin_users_any_branch() }, ...branchList],
		branchChoices: branchList
	};
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
		if (!form.valid) return invalidForm(form);

		const { name, email, password, role, branchId, branchIds } = form.data;

		const target = await orgRole(orgId, role);
		if (!target) {
			return refuseForm(form, m.admin_users_choose_role(), { field: 'role' });
		}
		// Only an owner can make another owner: the owner role holds every permission.
		if (target.isOwner && !event.locals.isSuperAdmin) {
			return refuseForm(form, m.admin_users_only_owner_add_owner(), {
				field: 'role',
				status: 403
			});
		}
		if (branchId) {
			const [b] = await db
				.select({ id: branch.id })
				.from(branch)
				.where(and(eq(branch.id, branchId), eq(branch.orgId, orgId)));
			if (!b) {
				return refuseForm(form, m.admin_users_choose_branch(), { field: 'branchId' });
			}
		}

		if (branchIds.length) {
			const mine = await db
				.select({ id: branch.id })
				.from(branch)
				.where(and(eq(branch.orgId, orgId), inArray(branch.id, branchIds)));
			if (mine.length !== new Set(branchIds).size) {
				return refuseForm(form, m.admin_users_choose_branches(), { field: 'branchIds._errors' });
			}
		}

		const [taken] = await db.select({ id: user.id }).from(user).where(eq(user.email, email));
		if (taken) {
			return refuseForm(form, m.admin_users_email_in_use(), {
				field: 'email',
				fieldText: m.admin_register_email_taken(),
				status: 409
			});
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
			await setUserBranches(db, orgId, id, branchIds);
		} catch (err) {
			console.error('user create failed', err);
			const text =
				err instanceof APIError && err.message ? err.message : m.admin_users_create_failed();
			return refuseForm(form, text, { status: 500 });
		}

		redirect(
			`/dashboard/admin-panel/users/${id}`,
			{ type: 'success', message: m.admin_users_can_sign_in({ name }) },
			event.cookies
		);
	}
};
