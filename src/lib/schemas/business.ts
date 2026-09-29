import { z } from 'zod/v4';

export const businessSchema = z.object({
	name: z.string().trim().min(2, 'Enter the business name').max(120),
	tin: z
		.string()
		.trim()
		.regex(/^\d{10}$/, 'A TIN is 10 digits')
		.or(z.literal(''))
		.default(''),
	phone: z.string().trim().max(30).default(''),
	address: z.string().trim().max(255).default(''),
	/** Off for an internal store: hides customers everywhere. */
	sellsToCustomers: z.boolean().default(true),
	vatRegistered: z.boolean().default(false),
	vatRate: z.coerce.number().min(0).max(100).default(15),
	withholdingAgent: z.boolean().default(false),
	withholdingRate: z.coerce.number().min(0).max(100).default(3),
	withholdingThreshold: z.coerce.number().min(0).default(10000),
	/** Empty: not a TOT payer. */
	totRate: z.number().min(0).max(100).nullable().default(null),
	/** Empty: no limit. */
	maxDiscountPercent: z.number().min(0).max(100).nullable().default(null),
	/** Empty: e-invoicing off. */
	einvoiceMode: z.enum(['', 'sandbox', 'live']).default(''),
	einvoiceEndpoint: z.url('Enter the full URL').or(z.literal('')).default(''),
	einvoiceTokenUrl: z.url('Enter the full URL').or(z.literal('')).default(''),
	einvoiceClientId: z.string().trim().max(120).default(''),
	/** Empty keeps the stored one. */
	einvoiceSecret: z.string().trim().max(300).default(''),
	/** How stock going out is valued. */
	costingMethod: z.enum(['average', 'fifo']).default('average'),
	/** Hold stock for accepted proformas and approved requisitions. */
	reserveStock: z.boolean().default(false),
	// Maker-checker limits, in birr. Empty: no approval needed.
	approveAdjustmentsOver: z.number().min(0).nullable().default(null),
	approveWriteOffs: z.boolean().default(false),
	approveCountsOver: z.number().min(0).nullable().default(null),
	approveOrdersOver: z.number().min(0).nullable().default(null)
});

export const LOGO_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
export const MAX_LOGO_BYTES = 2 * 1024 * 1024;

export const logoSchema = z.object({
	logo: z
		.instanceof(File, { message: 'Choose an image.' })
		.refine((f) => f.size > 0, 'The file is empty.')
		.refine((f) => f.size <= MAX_LOGO_BYTES, 'A logo can be at most 2 MB.')
		.refine((f) => LOGO_TYPES.includes(f.type), 'Use a PNG, JPG or WebP image.')
});
