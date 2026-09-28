import { z } from 'zod/v4';
import { LOCATION_KINDS } from '$lib/constants';

export const add = z.object({
	name: z.string().trim().min(2, 'Enter a name').max(100),
	branchId: z.coerce.number().int().positive('Choose a branch'),
	kind: z.enum(LOCATION_KINDS).default('storage'),
	status: z.boolean().default(true)
});
export const edit = add.extend({ id: z.coerce.number() });
