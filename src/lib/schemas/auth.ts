import { z } from 'zod/v4';

export const loginSchema = z.object({
	email: z.email({ error: 'Invalid email address' }),
	password: z.string().min(8, { error: 'Password must be at least 8 characters' })
});
export type LoginSchema = typeof loginSchema;

export const registerSchema = z.object({
	business: z.string().trim().min(2, 'Enter the business name').max(120),
	tin: z
		.string()
		.trim()
		.regex(/^\d{10}$/, 'A TIN is 10 digits')
		.or(z.literal(''))
		.default(''),
	phone: z.string().trim().max(30).default(''),
	name: z.string().trim().min(2, 'Enter your name').max(100),
	email: z.email({ error: 'Invalid email address' }),
	password: z.string().min(8, { error: 'Password must be at least 8 characters' }).max(128)
});
export type RegisterSchema = typeof registerSchema;

export const forgotSchema = z.object({
	email: z.email({ error: 'Enter the email you sign in with' })
});

export const resetSchema = z
	.object({
		token: z.string().min(1),
		password: z.string().min(8, 'At least 8 characters').max(128),
		confirm: z.string().min(1, 'Type the new password again')
	})
	.refine((d) => d.password === d.confirm, {
		message: 'The two passwords do not match',
		path: ['confirm']
	});
