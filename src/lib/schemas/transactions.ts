import { z } from 'zod/v4';
import { TRANSACTION_DIRECTIONS, TRANSACTION_PURPOSES } from '$lib/constants';
import { choices, labels } from '$lib/format';
import { m } from '$lib/paraglide/messages.js';
import { day } from '$lib/schemas/common';

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
export const attachment = z
	.instanceof(File, { error: () => m.sales_file_choose() })
	.refine((f) => f.size > 0, { error: () => m.sales_file_empty() })
	.refine((f) => f.size <= MAX_ATTACHMENT_BYTES, { error: () => m.sales_file_too_big() })
	.refine((f) => ATTACHMENT_TYPES.includes(f.type), { error: () => m.sales_file_types() });

const fields = {
	direction: z.enum(TRANSACTION_DIRECTIONS).default('in'),
	amount: z
		.number({ error: () => m.sales_enter_amount() })
		.positive({ error: () => m.sales_enter_amount() })
		.max(999_999_999_999),
	occurredOn: day,
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
	supplierId: z.coerce.number().int().min(0).default(0),
	/** 0 = no customer named — a walk-in, or not a sale at all. */
	customerId: z.coerce.number().int().min(0).default(0),
	/** Tax withheld on top of `amount`. */
	withheld: z
		.number()
		.min(0, { error: () => m.sales_cannot_be_negative() })
		.default(0),
	withholdingReceipt: z.string().trim().max(60).default('')
};

export const transactionAdd = z.object({ ...fields, file: attachment.optional() });
export const transactionEdit = z.object(fields);
export const attachmentAdd = z.object({ file: attachment });
export const voidSchema = z.object({
	reason: z
		.string()
		.trim()
		.min(3, { error: () => m.sales_void_why() })
		.max(255)
});
/** Linking a stock document to a transaction that already exists. */
export const linkSchema = z.object({
	transactionId: z.coerce
		.number()
		.int()
		.positive({ error: () => m.sales_choose_transaction() })
});

export const DIRECTION_CHOICES = choices([
	['in', m.sales_dir_in],
	['out', m.sales_dir_out]
]);

export const PURPOSE_CHOICES = choices([
	['purchase', m.sales_purpose_purchase_long],
	['sale', m.sales_purpose_sale],
	['expense', m.sales_purpose_expense_long],
	['other_income', m.sales_purpose_other_income],
	['other', m.sales_purpose_other]
]);

export const PURPOSE_LABELS: Record<string, string> = labels({
	purchase: m.sales_purpose_purchase,
	sale: m.sales_purpose_sale,
	expense: m.sales_purpose_expense,
	other_income: m.sales_purpose_other_income,
	other: m.sales_purpose_other
});

export const PAYMENT_KIND_CHOICES = choices([
	['cash', m.sales_kind_cash],
	['mobile_money', m.sales_kind_mobile],
	['bank', m.sales_kind_bank],
	['cheque', m.sales_kind_cheque],
	['other', m.sales_purpose_other]
]);
