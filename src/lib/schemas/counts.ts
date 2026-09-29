import { m } from '$lib/paraglide/messages.js';
import { z } from 'zod/v4';
import { day } from '$lib/schemas/common';

export const countOpen = z.object({
	locationId: z.coerce
		.number()
		.int()
		.positive({ error: () => m.stock_v_count_location() }),
	/** 0 = every item at the location. */
	categoryId: z.coerce.number().int().min(0).default(0),
	blind: z.boolean().default(true),
	countDate: day,
	note: z.string().trim().max(500).default('')
});

export const countFound = z.object({
	itemId: z.coerce
		.number()
		.int()
		.positive({ error: () => m.stock_v_item_found() }),
	/** 0 = no lot (items that do not track lots). */
	lotId: z.coerce.number().int().min(0).default(0),
	counted: z.coerce.number().positive({ error: () => m.stock_v_how_many_found() })
});
