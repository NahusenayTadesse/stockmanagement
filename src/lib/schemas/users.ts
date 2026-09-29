import { z } from 'zod/v4';

export const roleSchema = z.object({
	name: z.string().trim().min(1, 'Role name is required').max(64),
	description: z.string().trim().max(255).default(''),
	permissions: z.array(z.coerce.number()).min(1, 'Select at least one permission')
});

export const addUserSchema = z.object({
	name: z.string().trim().min(2, 'Enter the person’s name').max(100),
	email: z.email('Invalid email address'),
	password: z.string().min(8, 'At least 8 characters').max(128),
	role: z.coerce.number().int().positive('Choose a role'),
	branchId: z.coerce.number().int().min(0).default(0),
	/** The branches they work in. None: every branch. */
	branchIds: z.array(z.coerce.number().int().positive()).default([])
});

export const editUserSchema = z.object({
	name: z.string().trim().min(2).max(100),
	email: z.email('Invalid email address'),
	role: z.coerce.number().int().positive('Choose a role'),
	branchId: z.coerce.number().int().min(0).default(0),
	/** The branches they work in. None: every branch. */
	branchIds: z.array(z.coerce.number().int().positive()).default([]),
	status: z.boolean().default(true),
	editPermission: z.boolean().default(false),
	permissionsList: z.array(z.coerce.number()).default([])
});

export const resetPasswordSchema = z.object({
	password: z.string().min(8, 'At least 8 characters').max(128)
});

export const changePasswordSchema = z
	.object({
		currentPassword: z.string().min(1, 'Current password is required'),
		newPassword: z.string().min(8, 'At least 8 characters').max(128),
		confirmPassword: z.string().min(1, 'Confirm the new password')
	})
	.refine((d) => d.newPassword === d.confirmPassword, {
		message: 'The two passwords do not match',
		path: ['confirmPassword']
	})
	.refine((d) => d.newPassword !== d.currentPassword, {
		message: 'Choose a password you are not already using',
		path: ['newPassword']
	});
