import { error } from '@sveltejs/kit';
import { and, eq, sql, TransactionRollbackError } from 'drizzle-orm';
import { message, superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { redirect } from 'sveltekit-flash-message/server';
import { isDuplicateKey } from '@nahu/admin-kit/server/dbErrors';
import { notDeleted } from '@nahu/admin-kit/server/softDelete';
import { requireSuperAdmin } from '@nahu/admin-kit/server/permissions';
import { db } from '$lib/server/db';
import {
	branch,
	permissions,
	rolePermissions,
	roles,
	specialPermissions,
	user
} from '$lib/server/db/schema';
import { orgIdOf } from '$lib/server/tenant';
import { branchOptions, roleOptions } from '$lib/server/options';
import {
	activeOwnerCount,
	orgRole,
	permissionOptions,
	branchesByUser,
	revokeSessions,
	setPassword,
	setUserBranches,
	ungrantable,
	permissionWords
} from '$lib/server/users';
import { editUserSchema, resetPasswordSchema } from '$lib/schemas/users';
import type { Actions, PageServerLoad } from './$types';
import { m } from '$lib/paraglide/messages.js';
import { invalidForm, refuseAction, refuseForm } from '$lib/server/actions';

/** The user, if they belong to the viewer's business; with their role. */
async function member(orgId: number, id: string) {
	const [row] = await db
		.select({
			id: user.id,
			name: user.name,
			email: user.email,
			roleId: user.roleId,
			role: roles.name,
			isOwner: roles.isOwner,
			branchId: user.branchId,
			branch: branch.name,
			status: user.isActive,
			createdAt: user.createdAt,
			updatedAt: user.updatedAt
		})
		.from(user)
		.innerJoin(roles, eq(roles.id, user.roleId))
		.leftJoin(branch, eq(branch.id, user.branchId))
		.where(and(eq(user.id, id), eq(user.orgId, orgId), notDeleted(user)))
		.limit(1);
	return row;
}

const worded = sql<string>`COALESCE(${permissions.description}, ${permissions.name})`;

export const load: PageServerLoad = async ({ params, locals }) => {
	const orgId = orgIdOf(locals);
	const person = await member(orgId, params.id);
	if (!person) error(404, m.admin_users_not_found());

	const [roleList, branchList, rolePerms, ownPerms, allPerms, works] = await Promise.all([
		roleOptions(orgId),
		branchOptions(orgId),
		db
			.select({ value: permissions.id, name: worded, description: permissions.name })
			.from(permissions)
			.innerJoin(
				rolePermissions,
				and(eq(permissions.id, rolePermissions.permissionId), notDeleted(rolePermissions))
			)
			.where(eq(rolePermissions.roleId, person.roleId)),
		db
			.select({ value: permissions.id, name: worded, description: permissions.name })
			.from(permissions)
			.innerJoin(
				specialPermissions,
				and(eq(permissions.id, specialPermissions.permissionId), notDeleted(specialPermissions))
			)
			.where(eq(specialPermissions.userId, person.id)),
		permissionOptions(),
		branchesByUser(orgId, person.id)
	]);
	const worksIn = works.get(person.id) ?? [];

	// Special permissions, when a user has any, replace the role's — dentalClinic's rule.
	const custom = ownPerms.length > 0;
	const permissionList = (custom ? ownPerms : rolePerms).map((p) => ({
		...p,
		name: permissionWords(p.description, p.name)
	}));

	const [form, passwordForm] = await Promise.all([
		superValidate(
			{
				name: person.name,
				email: person.email,
				role: person.roleId,
				branchId: person.branchId ?? 0,
				branchIds: worksIn.map((b) => b.id),
				status: person.status,
				editPermission: custom,
				permissionsList: permissionList.map((p) => p.value)
			},
			zod4(editUserSchema),
			{ errors: false }
		),
		superValidate(zod4(resetPasswordSchema))
	]);

	return {
		person,
		custom,
		permissionList,
		allPerms,
		roleList,
		branchList: [{ value: 0, name: m.admin_users_any_branch() }, ...branchList],
		branchChoices: branchList,
		worksIn: worksIn.map((b) => b.name),
		form,
		passwordForm
	};
};

export const actions: Actions = {
	editUser: async (event) => {
		const { locals, params } = event;
		const orgId = orgIdOf(locals);
		const form = await superValidate(event.request, zod4(editUserSchema));
		if (!form.valid) return invalidForm(form);

		const person = await member(orgId, params.id);
		if (!person) error(404, m.admin_users_not_found());

		const { name, email, role, branchId, branchIds, status, editPermission, permissionsList } =
			form.data;
		const refuse = (
			field: 'role' | 'status' | 'permissionsList._errors' | 'branchId' | 'branchIds._errors',
			text: string,
			code: 400 | 403 | 409 = 400
		) => refuseForm(form, text, { field, status: code });

		const target = await orgRole(orgId, role);
		if (!target) return refuse('role', m.admin_users_choose_role());

		// The owner role holds everything; only an owner may hand it out or change an owner.
		if ((target.isOwner || person.isOwner) && !locals.isSuperAdmin) {
			return refuse('role', m.admin_users_only_owner_change_owner(), 403);
		}
		// Never leave the business with nobody who can manage it.
		if (person.isOwner && person.status && (!target.isOwner || !status)) {
			if ((await activeOwnerCount(orgId, person.id)) === 0) {
				return refuse(target.isOwner ? 'status' : 'role', m.admin_users_only_active_owner(), 409);
			}
		}

		if (branchId) {
			const [b] = await db
				.select({ id: branch.id })
				.from(branch)
				.where(and(eq(branch.id, branchId), eq(branch.orgId, orgId)));
			if (!b) return refuse('branchId', m.admin_users_choose_branch());
		}

		if (editPermission) {
			if (!permissionsList.length)
				return refuse('permissionsList._errors', m.admin_users_select_permission());
			const refused = await ungrantable(locals, permissionsList);
			if (refused === null)
				return refuse('permissionsList._errors', m.admin_users_choose_permissions());
			if (refused.length) {
				return refuse(
					'permissionsList._errors',
					m.admin_users_cannot_grant({ names: refused.join(', ') }),
					403
				);
			}
		}

		try {
			const branchesOk = await db.transaction(async (tx) => {
				await tx
					.update(user)
					.set({ name, email, roleId: role, branchId: branchId || null, isActive: status })
					.where(eq(user.id, person.id));
				if (!(await setUserBranches(tx, orgId, person.id, branchIds))) {
					tx.rollback();
				}

				await tx.delete(specialPermissions).where(eq(specialPermissions.userId, person.id));
				if (editPermission) {
					await tx.insert(specialPermissions).values(
						permissionsList.map((permissionId) => ({
							userId: person.id,
							permissionId,
							createdBy: locals.user?.id
						}))
					);
				}

				// What they may do has changed: it applies from their next sign-in, everywhere.
				if (person.id !== locals.user?.id) await revokeSessions(tx, person.id);
				return true;
			});
			if (!branchesOk) return refuse('branchIds._errors', m.admin_users_choose_branches());
		} catch (err) {
			if (err instanceof TransactionRollbackError) {
				return refuse('branchIds._errors', m.admin_users_choose_branches());
			}
			if (isDuplicateKey(err)) {
				return refuseForm(form, m.admin_users_email_in_use(), {
					field: 'email',
					fieldText: m.admin_users_email_taken_other(),
					status: 409
				});
			}
			console.error('user update failed', err);
			return refuseForm(form, m.admin_users_save_failed(), { status: 500 });
		}

		return message(form, { type: 'success', text: m.admin_users_saved() });
	},

	/** Sets a new password and signs the user out everywhere. */
	resetPassword: async (event) => {
		const { locals, params } = event;
		const orgId = orgIdOf(locals);
		const form = await superValidate(event.request, zod4(resetPasswordSchema));
		if (!form.valid) {
			return refuseForm(form, m.admin_users_check_password());
		}

		const person = await member(orgId, params.id);
		if (!person) error(404, m.admin_users_not_found());
		if (person.isOwner && !locals.isSuperAdmin) {
			return refuseForm(form, m.admin_users_only_owner_reset_owner(), { status: 403 });
		}

		await setPassword(person.id, form.data.password);
		return message(form, {
			type: 'success',
			text: m.admin_users_password_changed({ name: person.name })
		});
	},

	/** Soft delete. Super admin only; never yourself, never the last owner. */
	delete: async (event) => {
		const { params, locals, cookies } = event;
		requireSuperAdmin(locals);
		const orgId = orgIdOf(locals);

		if (params.id === locals.user?.id)
			return refuseAction(event, m.admin_users_cannot_delete_self());

		const person = await member(orgId, params.id);
		if (!person) error(404, m.admin_users_not_found());
		if (person.isOwner && (await activeOwnerCount(orgId, person.id)) === 0) {
			return refuseAction(event, m.admin_users_only_active_owner_short());
		}

		await db.transaction(async (tx) => {
			await tx
				.update(user)
				.set({ deletedAt: new Date(), deletedBy: locals.user?.id ?? null, isActive: false })
				.where(eq(user.id, person.id));
			await revokeSessions(tx, person.id);
		});

		redirect(
			'/dashboard/admin-panel/users',
			{ type: 'success', message: m.admin_users_removed({ name: person.name }) },
			cookies
		);
	}
};
