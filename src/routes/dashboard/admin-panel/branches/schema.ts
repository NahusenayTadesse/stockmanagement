import { z } from 'zod/v4';
import { m } from '$lib/paraglide/messages.js';

export const add = z.object({
	name: z
		.string()
		.trim()
		.min(2, { error: () => m.admin_v_enter_name() })
		.max(100),
	code: z
		.string()
		.trim()
		.toUpperCase()
		.regex(/^[A-Z0-9]{2,10}$/, { error: () => m.admin_v_branch_code() }),
	phone: z.string().trim().max(30).default(''),
	address: z.string().trim().max(255).default(''),
	status: z.boolean().default(true)
});
export const edit = add.extend({ id: z.coerce.number() });
