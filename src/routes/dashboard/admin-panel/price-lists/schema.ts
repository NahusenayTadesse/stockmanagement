import { z } from 'zod/v4';

export const add = z.object({
	name: z.string().trim().min(2, 'Name it, e.g. Wholesale').max(80),
	note: z.string().trim().max(255).default(''),
	status: z.boolean().default(true)
});
export const edit = add.extend({ id: z.coerce.number() });

export const itemAdd = z.object({
	itemId: z.coerce.number().int().positive('Choose an item'),
	/** 0 = the item's base unit. */
	uomId: z.coerce.number().int().min(0).default(0),
	price: z.number({ error: 'Enter the price' }).min(0)
});
export const itemEdit = itemAdd.extend({ id: z.coerce.number() });
