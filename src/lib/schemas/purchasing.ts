import { z } from 'zod/v4';

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick a date');

export const orderHeader = z.object({
	supplierId: z.coerce.number().int().positive('Choose the supplier, or add a new one'),
	locationId: z.coerce.number().int().positive('Choose where it should be delivered'),
	orderDate: day,
	expectedDate: z
		.string()
		.regex(/^(\d{4}-\d{2}-\d{2})?$/, 'Pick a date')
		.default(''),
	reference: z.string().trim().max(80).default(''),
	note: z.string().trim().max(2000).default('')
});

export const orderLineAdd = z.object({
	itemId: z.coerce.number().int().positive('Choose an item'),
	quantity: z.coerce.number().positive('Enter how many'),
	/** 0 = the item's base unit. */
	uomId: z.coerce.number().int().min(0).default(0),
	unitPrice: z.number().min(0).nullable().default(null),
	note: z.string().trim().max(255).default('')
});
export const orderLineEdit = orderLineAdd.extend({ id: z.coerce.number() });

export const PO_STATUS_LABELS: Record<string, string> = {
	draft: 'Draft',
	ordered: 'Ordered',
	partially_received: 'Partly received',
	received: 'Received',
	closed: 'Closed',
	cancelled: 'Cancelled'
};
