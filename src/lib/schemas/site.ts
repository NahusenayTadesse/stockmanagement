import { z } from 'zod/v4';
import { m } from '$lib/paraglide/messages.js';

/** The contact page's form. `website` is a trap: people never see it, scripts fill it in. */
export const contactSchema = z.object({
	name: z
		.string()
		.trim()
		.min(2, { error: () => m.admin_v_your_name() })
		.max(100),
	email: z.email({ error: () => m.admin_v_invalid_email() }).max(255),
	phone: z.string().trim().max(30).default(''),
	company: z.string().trim().max(120).default(''),
	subject: z
		.string()
		.trim()
		.min(3, { error: () => m.site_v_subject() })
		.max(150),
	message: z
		.string()
		.trim()
		.min(10, { error: () => m.site_v_message() })
		.max(4000),
	website: z.string().max(200).default('')
});
export type ContactSchema = typeof contactSchema;
