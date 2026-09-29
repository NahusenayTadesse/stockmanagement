import { z } from 'zod/v4';
import { m } from '$lib/paraglide/messages.js';

/**
 * A customer: only the name is needed. Walk-in buyers who leave no name are not customers at all —
 * their sales simply have no customer.
 */
export const customerSchema = z.object({
	name: z
		.string()
		.trim()
		.min(2, { error: () => m.sales_enter_customer_name() })
		.max(160),
	phone: z
		.string()
		.trim()
		.regex(/^\+?[0-9][0-9 ()-]{6,24}$/, { error: () => m.sales_enter_phone() })
		.or(z.literal(''))
		.default(''),
	email: z
		.email({ error: () => m.sales_enter_email() })
		.or(z.literal(''))
		.default(''),
	address: z.string().trim().max(255).default(''),
	tin: z
		.string()
		.trim()
		.regex(/^\d{10}$/, { error: () => m.sales_tin_digits() })
		.or(z.literal(''))
		.default(''),
	note: z.string().trim().max(255).default(''),
	/** Empty: no limit. 0: cash only. */
	creditLimit: z
		.number()
		.min(0, { error: () => m.sales_limit_negative() })
		.nullable()
		.default(null),
	creditDays: z.coerce
		.number()
		.int()
		.min(0, { error: () => m.sales_zero_or_more_days() })
		.max(365, { error: () => m.sales_at_most_year() })
		.default(30),
	/** A withholding agent: keeps back tax from what it pays. */
	withholdsTax: z.boolean().default(false),
	/** 0 = list prices. */
	priceListId: z.coerce.number().int().min(0).default(0)
});

/** A payment received from a customer, from their page. */
export const receivePayment = z.object({
	amount: z
		.number({ error: () => m.sales_enter_amount() })
		.positive({ error: () => m.sales_enter_amount() }),
	occurredOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { error: () => m.sales_pick_the_date() }),
	paymentMethodId: z.coerce.number().int().min(0).default(0),
	reference: z.string().trim().max(100).default(''),
	receiptNumber: z.string().trim().max(60).default(''),
	description: z.string().trim().max(255).default(''),
	withheld: z
		.number()
		.min(0, { error: () => m.sales_cannot_be_negative() })
		.default(0),
	withholdingReceipt: z.string().trim().max(60).default('')
});

export const customerEdit = customerSchema.extend({ status: z.boolean().default(true) });
