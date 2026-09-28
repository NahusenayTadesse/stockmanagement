import { z } from 'zod/v4';
import { TRANSACTION_DIRECTIONS, TRANSACTION_PURPOSES } from '$lib/constants';

export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const ATTACHMENT_TYPES = [
	'application/pdf',
	'image/png',
	'image/jpeg',
	'image/webp',
	'image/heic',
	'image/heif'
];

/** A screenshot of a transfer or a PDF receipt. */
const attachment = z
	.instanceof(File, { message: 'Choose a screenshot or a PDF.' })
	.refine((f) => f.size > 0, 'The file is empty.')
	.refine((f) => f.size <= MAX_ATTACHMENT_BYTES, 'Files can be at most 10 MB.')
	.refine(
		(f) => ATTACHMENT_TYPES.includes(f.type),
		'Only screenshots (PNG, JPG, WebP, HEIC) and PDFs.'
	);

const fields = {
	direction: z.enum(TRANSACTION_DIRECTIONS).default('in'),
	amount: z.number({ error: 'Enter the amount' }).positive('Enter the amount').max(999_999_999_999),
	occurredOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick the date the money moved'),
	/** 0 = not said. */
	paymentMethodId: z.coerce.number().int().min(0).default(0),
	purpose: z.enum(TRANSACTION_PURPOSES).default('other'),
	receiptNumber: z.string().trim().max(60).default(''),
	reference: z.string().trim().max(100).default(''),
	party: z.string().trim().max(160).default(''),
	description: z.string().trim().max(255).default(''),
	/** 0 = the whole business. */
	branchId: z.coerce.number().int().min(0).default(0),
	/** 0 = not a supplier. */
	supplierId: z.coerce.number().int().min(0).default(0)
};

export const transactionAdd = z.object({ ...fields, file: attachment.optional() });
export const transactionEdit = z.object(fields);
export const attachmentAdd = z.object({ file: attachment });
export const voidSchema = z.object({
	reason: z.string().trim().min(3, 'Say why it is being voided').max(255)
});
/** Linking a stock document to a transaction that already exists. */
export const linkSchema = z.object({
	transactionId: z.coerce.number().int().positive('Choose a transaction')
});

export const DIRECTION_CHOICES = [
	{ value: 'in', name: 'Money in — received' },
	{ value: 'out', name: 'Money out — paid' }
];

export const PURPOSE_CHOICES = [
	{ value: 'purchase', name: 'Purchase (stock bought)' },
	{ value: 'sale', name: 'Sale' },
	{ value: 'expense', name: 'Expense (rent, utilities, transport…)' },
	{ value: 'other_income', name: 'Other income' },
	{ value: 'other', name: 'Other' }
];

export const PURPOSE_LABELS: Record<string, string> = {
	purchase: 'Purchase',
	sale: 'Sale',
	expense: 'Expense',
	other_income: 'Other income',
	other: 'Other'
};

export const PAYMENT_KIND_CHOICES = [
	{ value: 'cash', name: 'Cash' },
	{ value: 'mobile_money', name: 'Mobile money (Telebirr, CBE Birr, M-Pesa)' },
	{ value: 'bank', name: 'Bank account' },
	{ value: 'cheque', name: 'Cheque' },
	{ value: 'other', name: 'Other' }
];
