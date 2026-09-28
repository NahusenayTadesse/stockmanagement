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
	address: z.string().trim().max(255).default('')
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
