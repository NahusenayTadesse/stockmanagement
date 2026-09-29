import { z } from 'zod/v4';
import { formatEthPhone } from '$lib/phone';
import { m } from '$lib/paraglide/messages.js';

/** One Ethiopian mobile number, in any usual spelling. */
const mobile = z
	.string()
	.trim()
	.max(30)
	.refine((v) => 'phone' in formatEthPhone(v), { error: () => m.admin_v_mobile() });

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
			{ error: () => m.admin_v_mobiles() }
		)
		.default(''),
	smsSignature: z.string().trim().max(40).default('')
});

/** A message someone writes: a test, a note to a customer. */
export const smsWriteSchema = z.object({
	to: mobile,
	text: z
		.string()
		.trim()
		.min(1, { error: () => m.admin_v_write_message() })
		.max(300, { error: () => m.admin_v_300() })
});
