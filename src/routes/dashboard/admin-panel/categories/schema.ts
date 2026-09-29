import { z } from 'zod/v4';

export const add = z.object({
	name: z.string().trim().min(2, 'Enter a name').max(100),
	nameAm: z.string().trim().max(100).default(''),
	expiryWarningDays: z.coerce.number().int().min(0).max(3650).default(90),
	/** The least shelf life a delivery may have left. Empty: any. */
	minShelfLifeDays: z.number().int().min(0).max(3650).nullable().default(null),
	/** Below it: refuse the receipt, rather than flag it. */
	refuseShortShelfLife: z.boolean().default(false),
	status: z.boolean().default(true)
});
export const edit = add.extend({ id: z.coerce.number() });
