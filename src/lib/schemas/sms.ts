import { z } from 'zod/v4';
import { formatEthPhone } from '$lib/phone';

/** One Ethiopian mobile number, in any usual spelling. */
const mobile = z
	.string()
	.trim()
	.max(30)
	.refine((v) => 'phone' in formatEthPhone(v), 'An Ethiopian mobile number, e.g. 0911 234 567');

export const smsSettingsSchema = z.object({
	smsEnabled: z.boolean().default(false),
	smsSales: z.boolean().default(false),
	smsPayments: z.boolean().default(false),
	/** Comma-separated. Empty: no staff alerts. */
	smsAlertPhones: z
		.string()
		.trim()
		.max(255)
		.refine(
			(v) =>
				v
					.split(/[,;\n]/)
					.map((x) => x.trim())
					.filter(Boolean)
					.every((x) => 'phone' in formatEthPhone(x)),
			'Ethiopian mobile numbers, separated by commas'
		)
		.default(''),
	smsSignature: z.string().trim().max(40).default('')
});

/** A message someone writes: a test, a note to a customer. */
export const smsWriteSchema = z.object({
	to: mobile,
	text: z.string().trim().min(1, 'Write the message').max(300, 'At most 300 characters')
});
