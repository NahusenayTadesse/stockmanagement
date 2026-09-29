import { z } from 'zod/v4';
import { m } from '$lib/paraglide/messages.js';

export const loginSchema = z.object({
	email: z.email({ error: () => m.admin_v_invalid_email() }),
	password: z.string().min(8, { error: () => m.admin_v_password_8() })
});
export type LoginSchema = typeof loginSchema;

export const registerSchema = z.object({
	business: z
		.string()
		.trim()
		.min(2, { error: () => m.admin_v_business_name() })
		.max(120),
	tin: z
		.string()
		.trim()
		.regex(/^\d{10}$/, { error: () => m.admin_v_tin() })
		.or(z.literal(''))
		.default(''),
	phone: z.string().trim().max(30).default(''),
	name: z
		.string()
		.trim()
		.min(2, { error: () => m.admin_v_your_name() })
		.max(100),
	email: z.email({ error: () => m.admin_v_invalid_email() }),
	password: z
		.string()
		.min(8, { error: () => m.admin_v_password_8() })
		.max(128)
});
export type RegisterSchema = typeof registerSchema;

export const forgotSchema = z.object({
	email: z.email({ error: () => m.admin_v_signin_email() })
});

export const resetSchema = z
	.object({
		token: z.string().min(1),
		password: z
			.string()
			.min(8, { error: () => m.admin_v_at_least_8() })
			.max(128),
		confirm: z.string().min(1, { error: () => m.admin_v_type_again() })
	})
	.refine((d) => d.password === d.confirm, {
		error: () => m.admin_v_passwords_differ(),
		path: ['confirm']
	});
