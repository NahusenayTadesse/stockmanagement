import { m } from '$lib/paraglide/messages.js';
import { z } from 'zod/v4';
import { ADJUSTMENT_REASONS, DOCUMENT_TYPES, LOT_STATUSES } from '$lib/constants';

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { error: () => m.stock_v_date() });

export const documentHeader = z.object({
	type: z.enum(DOCUMENT_TYPES).default('receipt'),
	docDate: day,
	fromLocationId: z.coerce.number().int().min(0).default(0),
	toLocationId: z.coerce.number().int().min(0).default(0),
	/** Receipts: who delivered it. 0 = not chosen yet. */
	supplierId: z.coerce.number().int().min(0).default(0),
	/** Issues: the customer, if anyone cares to say. 0 = none (walk-in, internal issue). */
	customerId: z.coerce.number().int().min(0).default(0),
	reference: z.string().trim().max(80).default(''),
	party: z.string().trim().max(160).default(''),
	reason: z.enum(['', ...ADJUSTMENT_REASONS]).default(''),
	note: z.string().trim().max(2000).default(''),
	/** Transfers to another branch: who is carrying it. Optional. */
	driverName: z.string().trim().max(120).default(''),
	vehiclePlate: z.string().trim().max(20).default(''),
	/** Receipts bought in another currency: its code, and birr per unit of it. Empty: birr. */
	currency: z
		.string()
		.trim()
		.toUpperCase()
		.regex(/^([A-Z]{3})?$/, { error: () => m.stock_v_three_letters() })
		.default(''),
	exchangeRate: z
		.number()
		.positive({ error: () => m.stock_v_above_zero() })
		.nullable()
		.default(null)
});

export const lineAdd = z.object({
	itemId: z.coerce
		.number()
		.int()
		.positive({ error: () => m.stock_v_item() }),
	quantity: z.coerce.number().refine((n) => n !== 0, { error: () => m.stock_v_quantity() }),
	/** 0 means the item's base unit. */
	uomId: z.coerce.number().int().min(0).default(0),
	unitCost: z.number().min(0).nullable().default(null),
	/** Receipts in another currency: the invoiced price in that currency; the birr cost follows. */
	foreignUnitCost: z.number().min(0).nullable().default(null),
	/** Issues: the sale price per unit above. Empty takes the item's list price. */
	unitPrice: z.number().min(0).nullable().default(null),
	/** 0 means first-expiry-first-out. */
	lotId: z.coerce.number().int().min(0).default(0),
	lotNumber: z.string().trim().max(60).default(''),
	expiryDate: z
		.string()
		.regex(/^(\d{4}-\d{2}-\d{2})?$/, { error: () => m.stock_v_date() })
		.default(''),
	serials: z.string().max(5000).default('')
});
export const lineEdit = lineAdd.extend({ id: z.coerce.number() });

export const lotEdit = z.object({
	id: z.coerce.number(),
	status: z.enum(LOT_STATUSES),
	note: z.string().trim().max(255).default('')
});
