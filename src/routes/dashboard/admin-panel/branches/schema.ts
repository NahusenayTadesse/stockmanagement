import { z } from 'zod/v4';

export const add = z.object({
	name: z.string().trim().min(2, 'Enter a name').max(100),
	code: z
		.string()
		.trim()
		.toUpperCase()
		.regex(/^[A-Z0-9]{2,10}$/, '2–10 letters or digits, e.g. ADD or BDR'),
	phone: z.string().trim().max(30).default(''),
	address: z.string().trim().max(255).default(''),
	status: z.boolean().default(true)
});
export const edit = add.extend({ id: z.coerce.number() });
