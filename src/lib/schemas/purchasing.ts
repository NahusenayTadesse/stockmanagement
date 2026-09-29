import { z } from 'zod/v4';
import { m } from '$lib/paraglide/messages.js';
import { labels } from '$lib/format';
import { day, optionalDay } from '$lib/schemas/common';

export const orderHeader = z.object({
	supplierId: z.coerce
		.number()
		.int()
		.positive({ error: () => m.purchasing_v_choose_supplier() }),
	locationId: z.coerce
		.number()
		.int()
		.positive({ error: () => m.purchasing_v_choose_delivery() }),
	orderDate: day,
	expectedDate: optionalDay,
	reference: z.string().trim().max(80).default(''),
	note: z.string().trim().max(2000).default('')
});

export const orderLineAdd = z.object({
	itemId: z.coerce
		.number()
		.int()
		.positive({ error: () => m.purchasing_v_choose_item() }),
	quantity: z.coerce.number().positive({ error: () => m.purchasing_v_enter_quantity() }),
	/** 0 = the item's base unit. */
	uomId: z.coerce.number().int().min(0).default(0),
	unitPrice: z.number().min(0).nullable().default(null),
	note: z.string().trim().max(255).default('')
});
export const orderLineEdit = orderLineAdd.extend({ id: z.coerce.number() });

/** Read in the viewer's language when read (see `labels`). */
export const PO_STATUS_LABELS: Record<string, string> = labels({
	draft: m.purchasing_po_status_draft,
	ordered: m.purchasing_po_status_ordered,
	partially_received: m.purchasing_po_status_partially_received,
	received: m.purchasing_po_status_received,
	closed: m.purchasing_po_status_closed,
	cancelled: m.purchasing_po_status_cancelled
});

/** The words the status badge knows (its colour), for each order status. */
export const PO_BADGE: Record<string, string> = {
	draft: 'draft',
	ordered: 'pending',
	partially_received: 'pending',
	received: 'complete',
	closed: 'confirmed',
	cancelled: 'cancelled'
};
