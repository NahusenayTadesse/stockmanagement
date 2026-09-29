import { z } from 'zod/v4';
import { m } from '$lib/paraglide/messages.js';

export const add = z.object({
	name: z
		.string()
		.trim()
		.min(1, { error: () => m.admin_v_enter_name() })
		.max(40),
	symbol: z
		.string()
		.trim()
		.min(1, { error: () => m.admin_v_enter_symbol() })
		.max(12),
	status: z.boolean().default(true)
});
export const edit = add.extend({ id: z.coerce.number() });
