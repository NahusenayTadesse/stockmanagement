import { z } from 'zod/v4';

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick a date');

/** Who and when. A listed customer, or a one-off buyer's name and TIN — both optional. */
export const quoteHeader = z.object({
	customerId: z.coerce.number().int().min(0).default(0),
	buyerName: z.string().trim().max(160).default(''),
	buyerTin: z
		.string()
		.trim()
		.regex(/^\d{10}$/, 'A TIN is 10 digits')
		.or(z.literal(''))
		.default(''),
	buyerPhone: z.string().trim().max(40).default(''),
	/** 0 = decide when it becomes a sale. */
	locationId: z.coerce.number().int().min(0).default(0),
	quoteDate: day,
	validUntil: z
		.string()
		.regex(/^(\d{4}-\d{2}-\d{2})?$/, 'Pick a date')
		.default(''),
	reference: z.string().trim().max(80).default(''),
	note: z.string().trim().max(2000).default(''),
	terms: z.string().trim().max(2000).default('')
});

export const quoteLineAdd = z.object({
	itemId: z.coerce.number().int().positive('Choose an item'),
	quantity: z.coerce.number().positive('Enter how many'),
	/** 0 = the item's base unit. */
	uomId: z.coerce.number().int().min(0).default(0),
	/** Before VAT. Empty: the customer's (or list) price. */
	unitPrice: z.number().min(0).nullable().default(null),
	note: z.string().trim().max(255).default('')
});
export const quoteLineEdit = quoteLineAdd.extend({ id: z.coerce.number() });

export const QUOTE_STATUS_LABELS: Record<string, string> = {
	draft: 'Draft',
	sent: 'Sent',
	accepted: 'Accepted',
	converted: 'Became a sale',
	expired: 'Expired',
	cancelled: 'Cancelled'
};
