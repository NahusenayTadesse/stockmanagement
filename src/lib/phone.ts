/**
 * Phone numbers, shared by the SMS service and the forms that take numbers for it.
 */
import { m } from '$lib/paraglide/messages.js';

/**
 * An Ethiopian mobile number as GeezSMS wants it: `2519…` (Ethio Telecom) or `2517…` (Safaricom),
 * 12 digits. Accepts `0912 34 56 78`, `+251 912 345 678`, `912345678`. Landlines are refused.
 */
export function formatEthPhone(
	phone: string | null | undefined
): { phone: string } | { error: string } {
	if (!phone?.trim()) return { error: m.sales_phone_none() };
	let digits = phone.replace(/\D/g, '');
	if (digits.startsWith('0')) digits = '251' + digits.slice(1);
	else if (digits.length === 9 && /^[79]/.test(digits)) digits = '251' + digits;
	if (!/^251[79]\d{8}$/.test(digits)) {
		return { error: m.sales_phone_not_mobile({ phone }) };
	}
	return { phone: digits };
}
