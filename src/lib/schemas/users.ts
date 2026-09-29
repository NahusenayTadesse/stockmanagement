import { z } from 'zod/v4';
import { m } from '$lib/paraglide/messages.js';

export const roleSchema = z.object({
	name: z
		.string()
		.trim()
		.min(1, { error: () => m.admin_v_role_name() })
		.max(64),
	description: z.string().trim().max(255).default(''),
	permissions: z.array(z.coerce.number()).min(1, { error: () => m.admin_v_one_permission() })
});

export const addUserSchema = z.object({
	name: z
		.string()
		.trim()
		.min(2, { error: () => m.admin_v_person_name() })
		.max(100),
	email: z.email({ error: () => m.admin_v_invalid_email() }),
	password: z
		.string()
		.min(8, { error: () => m.admin_v_at_least_8() })
		.max(128),
	role: z.coerce
		.number()
		.int()
		.positive({ error: () => m.admin_v_choose_role() }),
	branchId: z.coerce.number().int().min(0).default(0),
	/** The branches they work in. None: every branch. */
	branchIds: z.array(z.coerce.number().int().positive()).default([])
});

export const editUserSchema = z.object({
	name: z.string().trim().min(2).max(100),
	email: z.email({ error: () => m.admin_v_invalid_email() }),
	role: z.coerce
		.number()
		.int()
		.positive({ error: () => m.admin_v_choose_role() }),
	branchId: z.coerce.number().int().min(0).default(0),
	/** The branches they work in. None: every branch. */
	branchIds: z.array(z.coerce.number().int().positive()).default([]),
	status: z.boolean().default(true),
	editPermission: z.boolean().default(false),
	permissionsList: z.array(z.coerce.number()).default([])
});

export const resetPasswordSchema = z.object({
	password: z
		.string()
		.min(8, { error: () => m.admin_v_at_least_8() })
		.max(128)
});

export const changePasswordSchema = z
	.object({
		currentPassword: z.string().min(1, { error: () => m.admin_v_current_required() }),
		newPassword: z
			.string()
			.min(8, { error: () => m.admin_v_at_least_8() })
			.max(128),
		confirmPassword: z.string().min(1, { error: () => m.admin_v_confirm_new() })
	})
	.refine((d) => d.newPassword === d.confirmPassword, {
		error: () => m.admin_v_passwords_differ(),
		path: ['confirmPassword']
	})
	.refine((d) => d.newPassword !== d.currentPassword, {
		error: () => m.admin_v_not_same(),
		path: ['newPassword']
	});
