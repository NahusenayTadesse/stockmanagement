import { z } from 'zod/v4';
import { LOCATION_KINDS } from '$lib/constants';

/** Every kind a person may choose: `transit` locations are the system's own. */
const CHOOSABLE = LOCATION_KINDS.filter((k) => k !== 'transit') as [
	Exclude<(typeof LOCATION_KINDS)[number], 'transit'>,
	...Exclude<(typeof LOCATION_KINDS)[number], 'transit'>[]
];

export const add = z.object({
	name: z.string().trim().min(2, 'Enter a name').max(100),
	branchId: z.coerce.number().int().positive('Choose a branch'),
	kind: z.enum(CHOOSABLE).default('storage'),
	status: z.boolean().default(true)
});
export const edit = add.extend({ id: z.coerce.number() });
