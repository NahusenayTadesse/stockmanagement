import { z } from 'zod/v4';

/** Ethiopian numbers in any usual spelling: 0911 234567, +251 911 23 45 67, 011-551-8990. */
const phone = z
	.string()
	.trim()
	.min(1, 'A phone number is required')
	.regex(
		/^\+?[0-9][0-9 ()-]{6,24}$/,
		'Enter a phone number, e.g. 0911 234 567 or +251 11 551 8990'
	);

export const supplierSchema = z.object({
	name: z.string().trim().min(2, 'Enter the supplier’s name').max(160),
	phone,
	email: z.email('Enter a valid email, or leave it empty').or(z.literal('')).default(''),
	address: z.string().trim().max(255).default(''),
	tin: z
		.string()
		.trim()
		.regex(/^\d{10}$/, 'A TIN is 10 digits')
		.or(z.literal(''))
		.default(''),
	contactPerson: z.string().trim().max(120).default(''),
	note: z.string().trim().max(255).default(''),
	/** Charges VAT: its deliveries carry input VAT. */
	vatRegistered: z.boolean().default(false),
	/** Usual days from order to delivery; what reorder planning works to. Empty: unknown. */
	leadTimeDays: z.number().int().min(0).max(365).nullable().default(null)
});

export const supplierEdit = supplierSchema.extend({ status: z.boolean().default(true) });
