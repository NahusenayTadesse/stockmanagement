import { z } from 'zod/v4';
import { m } from '$lib/paraglide/messages.js';
import { labels } from '$lib/format';
import { day, optionalDay } from '$lib/schemas/common';

export const requisitionHeader = z.object({
	department: z
		.string()
		.trim()
		.min(2, { error: () => m.purchasing_v_department() })
		.max(120),
	/** The store it is to come from. */
	locationId: z.coerce
		.number()
		.int()
		.positive({ error: () => m.purchasing_v_choose_store() }),
	requestDate: day,
	neededBy: optionalDay,
	note: z.string().trim().max(2000).default('')
});

export const requisitionLineAdd = z.object({
	itemId: z.coerce
		.number()
		.int()
		.positive({ error: () => m.purchasing_v_choose_item() }),
	quantity: z.coerce.number().positive({ error: () => m.purchasing_v_enter_quantity() }),
	/** 0 = the item's base unit. */
	uomId: z.coerce.number().int().min(0).default(0),
	note: z.string().trim().max(255).default('')
});
export const requisitionLineEdit = requisitionLineAdd.extend({ id: z.coerce.number() });

/** Read in the viewer's language when read (see `labels`). */
export const REQUISITION_STATUS_LABELS: Record<string, string> = labels({
	draft: m.purchasing_req_status_draft,
	submitted: m.purchasing_req_status_submitted,
	approved: m.purchasing_req_status_approved,
	rejected: m.purchasing_req_status_rejected,
	issued: m.purchasing_req_status_issued,
	cancelled: m.purchasing_req_status_cancelled
});

/** The words the status badge knows, for each requisition status. */
export const REQUISITION_BADGE: Record<string, string> = {
	draft: 'draft',
	submitted: 'pending',
	approved: 'approved',
	rejected: 'rejected',
	issued: 'complete',
	cancelled: 'cancelled'
};
