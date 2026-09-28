import { z } from 'zod/v4';
import { PAYMENT_KINDS } from '$lib/constants';

export const add = z.object({
	name: z.string().trim().min(2, 'Enter a name').max(60),
	kind: z.enum(PAYMENT_KINDS).default('other'),
	accountNumber: z.string().trim().max(60).default(''),
	status: z.boolean().default(true)
});
export const edit = add.extend({ id: z.coerce.number() });
