import { z } from 'zod/v4';

export const add = z.object({
	name: z.string().trim().min(1, 'Enter a name').max(40),
	symbol: z.string().trim().min(1, 'Enter a symbol').max(12),
	status: z.boolean().default(true)
});
export const edit = add.extend({ id: z.coerce.number() });
