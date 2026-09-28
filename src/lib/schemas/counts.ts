import { z } from 'zod/v4';

export const countOpen = z.object({
	locationId: z.coerce.number().int().positive('Choose the location to count'),
	/** 0 = every item at the location. */
	categoryId: z.coerce.number().int().min(0).default(0),
	blind: z.boolean().default(true),
	countDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick the count date'),
	note: z.string().trim().max(500).default('')
});

export const countFound = z.object({
	itemId: z.coerce.number().int().positive('Choose the item found'),
	/** 0 = no lot (items that do not track lots). */
	lotId: z.coerce.number().int().min(0).default(0),
	counted: z.coerce.number().positive('How many were found?')
});
