import { z } from 'zod/v4';

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick a date');

export const requisitionHeader = z.object({
	department: z.string().trim().min(2, 'Say who is asking: the department, ward or site').max(120),
	/** The store it is to come from. */
	locationId: z.coerce.number().int().positive('Choose the store it comes from'),
	requestDate: day,
	neededBy: z
		.string()
		.regex(/^(\d{4}-\d{2}-\d{2})?$/, 'Pick a date')
		.default(''),
	note: z.string().trim().max(2000).default('')
});

export const requisitionLineAdd = z.object({
	itemId: z.coerce.number().int().positive('Choose an item'),
	quantity: z.coerce.number().positive('Enter how many'),
	/** 0 = the item's base unit. */
	uomId: z.coerce.number().int().min(0).default(0),
	note: z.string().trim().max(255).default('')
});
export const requisitionLineEdit = requisitionLineAdd.extend({ id: z.coerce.number() });

export const REQUISITION_STATUS_LABELS: Record<string, string> = {
	draft: 'Draft',
	submitted: 'Waiting for approval',
	approved: 'Approved',
	rejected: 'Rejected',
	issued: 'Issued',
	cancelled: 'Cancelled'
};

/** The words the status badge knows, for each requisition status. */
export const REQUISITION_BADGE: Record<string, string> = {
	draft: 'draft',
	submitted: 'pending',
	approved: 'approved',
	rejected: 'rejected',
	issued: 'complete',
	cancelled: 'cancelled'
};
