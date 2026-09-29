import { z } from 'zod/v4';
import { m } from '$lib/paraglide/messages.js';

/** What the till sends when a sale is completed. */
export const checkoutPayload = z.object({
	customerId: z.number().int().positive().nullable().default(null),
	note: z.string().trim().max(255).nullable().default(null),
	/** Text the receipt to this number (a walk-in who asked for it). Empty: none. */
	smsTo: z.string().trim().max(30).nullable().default(null),
	lines: z
		.array(
			z.object({
				itemId: z.number().int().positive(),
				uomId: z.number().int().positive(),
				quantity: z.number().positive().max(1_000_000),
				unitPrice: z.number().min(0),
				serials: z.array(z.string().trim().min(1).max(60)).max(500).default([])
			})
		)
		.min(1, { error: () => m.sales_err_cart_empty() })
		.max(300),
	payments: z
		.array(
			z.object({
				methodId: z.number().int().positive(),
				amount: z.number().min(0),
				reference: z.string().trim().max(100).default('')
			})
		)
		.max(10)
});
export type CheckoutPayload = z.infer<typeof checkoutPayload>;
