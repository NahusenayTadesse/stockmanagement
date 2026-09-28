import { error, fail } from '@sveltejs/kit';
import { and, eq, sql } from 'drizzle-orm';
import { message, setError, superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { redirect, setFlash } from 'sveltekit-flash-message/server';
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
	revokeSessions,
	setPassword,
	ungrantable
} from '$lib/server/users';
import { editUserSchema, resetPasswordSchema } from '$lib/schemas/users';
import type { Actions, PageServerLoad } from './$types';

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
	if (!person) error(404, 'User not found');

	const [roleList, branchList, rolePerms, ownPerms, allPerms] = await Promise.all([
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
		permissionOptions()
	]);

	// Special permissions, when a user has any, replace the role's — dentalClinic's rule.
	const custom = ownPerms.length > 0;
	const permissionList = custom ? ownPerms : rolePerms;

	const [form, passwordForm] = await Promise.all([
		superValidate(
			{
				name: person.name,
				email: person.email,
				role: person.roleId,
				branchId: person.branchId ?? 0,
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
		branchList: [{ value: 0, name: 'Any branch' }, ...branchList],
		form,
		passwordForm
	};
};

export const actions: Actions = {
	editUser: async (event) => {
		const { locals, params } = event;
		const orgId = orgIdOf(locals);
		const form = await superValidate(event.request, zod4(editUserSchema));
		if (!form.valid) {
			return message(form, { type: 'error', text: 'Please check the form' }, { status: 400 });
		}

		const person = await member(orgId, params.id);
		if (!person) error(404, 'User not found');

		const { name, email, role, branchId, status, editPermission, permissionsList } = form.data;
		const refuse = (
			field: 'role' | 'status' | 'permissionsList._errors' | 'branchId',
			text: string,
			code: 400 | 403 | 409 = 400
		) => {
			setError(form, field, text);
			return message(form, { type: 'error', text }, { status: code });
		};

		const target = await orgRole(orgId, role);
		if (!target) return refuse('role', 'Choose a role from the list.');

		// The owner role holds everything; only an owner may hand it out or change an owner.
		if ((target.isOwner || person.isOwner) && !locals.isSuperAdmin) {
			return refuse('role', 'Only an owner can change an owner, or make someone an owner.', 403);
		}
		// Never leave the business with nobody who can manage it.
		if (person.isOwner && person.status && (!target.isOwner || !status)) {
			if ((await activeOwnerCount(orgId, person.id)) === 0) {
				return refuse(
					target.isOwner ? 'status' : 'role',
					'This is the only active owner. Make someone else an owner first.',
					409
				);
			}
		}

		if (branchId) {
			const [b] = await db
				.select({ id: branch.id })
				.from(branch)
				.where(and(eq(branch.id, branchId), eq(branch.orgId, orgId)));
			if (!b) return refuse('branchId', 'Choose a branch from the list.');
		}

		if (editPermission) {
			if (!permissionsList.length)
				return refuse('permissionsList._errors', 'Select at least one permission.');
			const refused = await ungrantable(locals, permissionsList);
			if (refused === null)
				return refuse('permissionsList._errors', 'Choose permissions from the list.');
			if (refused.length) {
				return refuse(
					'permissionsList._errors',
					`You cannot grant permissions you do not hold: ${refused.join(', ')}`,
					403
				);
			}
		}

		try {
			await db.transaction(async (tx) => {
				await tx
					.update(user)
					.set({ name, email, roleId: role, branchId: branchId || null, isActive: status })
					.where(eq(user.id, person.id));

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
			});
		} catch (err) {
			if (isDuplicateKey(err)) {
				setError(form, 'email', 'Another account already uses this email.');
				return message(
					form,
					{ type: 'error', text: 'That email is already in use.' },
					{ status: 409 }
				);
			}
			console.error('user update failed', err);
			return message(form, { type: 'error', text: 'Could not save the user.' }, { status: 500 });
		}

		return message(form, { type: 'success', text: 'User saved' });
	},

	/** Sets a new password and signs the user out everywhere. */
	resetPassword: async (event) => {
		const { locals, params } = event;
		const orgId = orgIdOf(locals);
		const form = await superValidate(event.request, zod4(resetPasswordSchema));
		if (!form.valid) {
			return message(form, { type: 'error', text: 'Please check the password' }, { status: 400 });
		}

		const person = await member(orgId, params.id);
		if (!person) error(404, 'User not found');
		if (person.isOwner && !locals.isSuperAdmin) {
			return message(
				form,
				{ type: 'error', text: 'Only an owner can reset an owner’s password.' },
				{ status: 403 }
			);
		}

		await setPassword(person.id, form.data.password);
		return message(form, {
			type: 'success',
			text: `Password changed. Tell ${person.name} the new one; they have been signed out.`
		});
	},

	/** Soft delete. Super admin only; never yourself, never the last owner. */
	delete: async ({ params, locals, cookies }) => {
		requireSuperAdmin(locals);
		const orgId = orgIdOf(locals);

		if (params.id === locals.user?.id) {
			setFlash({ type: 'error', message: 'You cannot delete your own account.' }, cookies);
			return fail(409);
		}

		const person = await member(orgId, params.id);
		if (!person) error(404, 'User not found');
		if (person.isOwner && (await activeOwnerCount(orgId, person.id)) === 0) {
			setFlash({ type: 'error', message: 'This is the only active owner.' }, cookies);
			return fail(409);
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
			{ type: 'success', message: `${person.name} was removed and signed out everywhere.` },
			cookies
		);
	}
};
