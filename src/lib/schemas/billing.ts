import { z } from 'zod/v4';
import { BILLING_PERIODS } from '$lib/constants';
import { m } from '$lib/paraglide/messages.js';
import { day } from '$lib/schemas/common';
import { attachment } from '$lib/schemas/transactions';

const packageId = z
	.number({ error: () => m.billing_choose_package() })
	.int()
	.positive({ error: () => m.billing_choose_package() });

/** Paying online: only the package is chosen; the amount is the package's. */
export const paySchema = z.object({ packageId });

/** Paying by bank transfer: the account paid into and the receipt — a screenshot or a PDF. */
export const transferSchema = z.object({
	packageId,
	bankAccountId: z.coerce
		.number({ error: () => m.billing_choose_account() })
		.int()
		.positive({ error: () => m.billing_choose_account() }),
	reference: z.string().trim().max(100).default(''),
	receipt: attachment
});

// ── The site admin's forms ──

/** Turning a receipt down, with the reason the business will read. */
export const rejectSchema = z.object({
	id: z.coerce.number().int().positive(),
	note: z
		.string()
		.trim()
		.min(3, { error: () => m.platform_v_reason() })
		.max(255)
});

/** Moving a business to a package, an end date, or onto a complimentary subscription. */
export const subscriptionSchema = z.object({
	packageId,
	paidUntil: day,
	complimentary: z.boolean().default(false)
});

/** A payment taken by hand. The months come from the package; the amount may be a discount. */
export const manualPaymentSchema = z.object({
	packageId,
	amount: z
		.number({ error: () => m.sales_enter_amount() })
		.min(0, { error: () => m.sales_enter_amount() })
		.max(999_999_999),
	note: z.string().trim().max(255).default('')
});

export const suspendSchema = z.object({
	reason: z
		.string()
		.trim()
		.min(3, { error: () => m.platform_v_reason() })
		.max(255)
});

/** A package's limit on people or branches. Empty: no limit. */
const limit = z.number().int().min(1).max(100000).nullable().default(null);

/** A package, as the site admin edits it. Empty limits mean "no limit". */
export const packageAdd = z.object({
	name: z
		.string()
		.trim()
		.min(2, { error: () => m.admin_v_enter_name() })
		.max(60),
	slug: z
		.string()
		.trim()
		.toLowerCase()
		.regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, { error: () => m.platform_v_slug() })
		.max(60),
	description: z.string().trim().max(255).default(''),
	price: z
		.number({ error: () => m.sales_enter_amount() })
		.min(0, { error: () => m.sales_enter_amount() })
		.max(999_999_999),
	billingMonths: z.coerce
		.number()
		.refine((n) => (BILLING_PERIODS as readonly number[]).includes(n), {
			error: () => m.platform_v_period()
		})
		.default(1),
	maxUsers: limit,
	maxBranches: limit,
	trialDays: z.coerce.number().int().min(0).max(365).default(14),
	highlights: z.string().max(2000).default(''),
	isFeatured: z.boolean().default(false),
	sortOrder: z.coerce.number().int().min(0).max(10000).default(0),
	status: z.boolean().default(true)
});
export const packageEdit = packageAdd.extend({ id: z.coerce.number() });

export const bankAccountAdd = z.object({
	bankName: z
		.string()
		.trim()
		.min(2, { error: () => m.admin_v_enter_name() })
		.max(80),
	accountName: z
		.string()
		.trim()
		.min(2, { error: () => m.admin_v_enter_name() })
		.max(120),
	accountNumber: z
		.string()
		.trim()
		.min(4, { error: () => m.platform_v_account_number() })
		.max(40),
	sortOrder: z.coerce.number().int().min(0).max(10000).default(0),
	status: z.boolean().default(true)
});
export const bankAccountEdit = bankAccountAdd.extend({ id: z.coerce.number() });

/** Closing a contact message, with a note for colleagues. */
export const handleMessageSchema = z.object({
	id: z.coerce.number().int().positive(),
	adminNote: z.string().trim().max(500).default('')
});
