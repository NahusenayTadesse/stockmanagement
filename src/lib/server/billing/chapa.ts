import { randomBytes } from 'node:crypto';
import { env } from '$env/dynamic/private';

/**
 * Chapa's hosted checkout, for subscription payments. Ported from fixtec, which runs on the same
 * account: start a checkout, and ask Chapa — server to server — what became of it.
 */

const CHAPA_BASE = 'https://api.chapa.co/v1';

/** Whether online payment is set up at all. Without the key the page offers bank transfer only. */
export const chapaEnabled = () => Boolean(env.CHAPA_SECRET_KEY?.trim());

/** Read per call (dynamic env) so a missing key fails the payment, not the build. */
function secretKey() {
	const key = env.CHAPA_SECRET_KEY?.trim();
	if (!key) throw new Error('CHAPA_SECRET_KEY is not configured');
	return key;
}

/**
 * A fresh reference for one payment attempt: `sm{orgId}-{random}`.
 *
 * The business's id is in it so a webhook can be traced by eye; the random part makes it
 * unguessable, and unique per attempt, which Chapa requires.
 */
export function newTxRef(orgId: number) {
	return `sm${orgId}-${randomBytes(9).toString('hex')}`;
}

/** Chapa only accepts letters, digits, spaces, dots, hyphens and underscores here. */
function sanitizeText(text: string, fallback: string) {
	return (
		text
			.replace(/[^a-zA-Z0-9\s.\-_]/g, ' ')
			.replace(/\s+/g, ' ')
			.trim() || fallback
	);
}

/**
 * Chapa wants a 10-digit local mobile number (`09…` / `07…`). A business's phone is typed
 * freely, so anything that is not a mobile is left off rather than failing the whole payment.
 */
function toChapaPhone(phone: string | null | undefined) {
	let digits = phone?.replace(/\D/g, '') ?? '';
	if (digits.startsWith('251')) digits = digits.slice(3);
	if (digits.startsWith('0')) digits = digits.slice(1);
	return /^[79]\d{8}$/.test(digits) ? `0${digits}` : undefined;
}

export type InitializeParams = {
	amount: number;
	email: string;
	name: string;
	phone?: string | null;
	txRef: string;
	callbackUrl: string;
	returnUrl: string;
	title?: string;
	description?: string;
};

/** What Chapa said was wrong, as one line: its message, or its per-field validation messages. */
function failureOf(status: number, data: { message?: unknown } | null): string {
	if (typeof data?.message === 'string') return data.message;
	if (data?.message && typeof data.message === 'object') {
		return Object.entries(data.message)
			.map(
				([field, messages]) =>
					`${field}: ${([] as string[]).concat(messages as string[]).join(', ')}`
			)
			.join('; ');
	}
	return `HTTP ${status}`;
}

/** Starts a hosted checkout and returns the URL to send the payer to. */
export async function initializeChapaTransaction(params: InitializeParams): Promise<string> {
	const [firstName, ...rest] = params.name.trim().split(/\s+/);

	const start = async (email: string | undefined) => {
		const res = await fetch(`${CHAPA_BASE}/transaction/initialize`, {
			method: 'POST',
			headers: { Authorization: `Bearer ${secretKey()}`, 'Content-Type': 'application/json' },
			body: JSON.stringify({
				amount: params.amount.toFixed(2),
				currency: 'ETB',
				email,
				first_name: firstName || 'Customer',
				last_name: rest.join(' ') || firstName || 'Customer',
				phone_number: toChapaPhone(params.phone),
				tx_ref: params.txRef,
				callback_url: params.callbackUrl,
				return_url: params.returnUrl,
				customization: {
					// Chapa caps the title at 16 characters.
					title: sanitizeText(params.title ?? '', 'Stock package').slice(0, 16),
					description: sanitizeText(params.description ?? '', 'Subscription payment')
				}
			})
		});
		const data = await res.json().catch(() => null);
		const url = res.ok && data?.status === 'success' ? data?.data?.checkout_url : undefined;
		return { url: url as string | undefined, detail: url ? '' : failureOf(res.status, data) };
	};

	let attempt = await start(params.email);
	/*
	 * Chapa checks the email's domain and turns some real addresses down ("email:
	 * validation.email"). The email is optional to Chapa — it only addresses Chapa's own receipt —
	 * so an owner is not kept from paying over it: the checkout is started again without one.
	 */
	if (!attempt.url && /email/i.test(attempt.detail)) attempt = await start(undefined);

	if (!attempt.url) throw new Error(`Chapa could not start the payment: ${attempt.detail}`);
	return attempt.url;
}

export type ChapaVerification = {
	/** Chapa says the payment went through. */
	paid: boolean;
	/** Chapa says it definitively failed (as opposed to "not finished yet"). */
	failed: boolean;
	amount: number;
	currency?: string;
	txRef?: string;
};

/**
 * Asks Chapa, server to server, what happened to a payment. This is the only thing that decides
 * whether a subscription is paid — never a query string, a redirect, or a webhook body on its own.
 */
export async function verifyChapaTransaction(txRef: string): Promise<ChapaVerification> {
	const res = await fetch(`${CHAPA_BASE}/transaction/verify/${encodeURIComponent(txRef)}`, {
		headers: { Authorization: `Bearer ${secretKey()}` }
	});
	const data = await res.json().catch(() => null);

	// An unknown reference is a 4xx with `status: "failed"` — "nothing paid yet", which is also
	// what an attempt the payer abandoned looks like.
	if (res.status >= 500) throw new Error(`Chapa verify failed: HTTP ${res.status}`);

	const status = data?.data?.status;
	return {
		paid: data?.status === 'success' && status === 'success',
		failed: status === 'failed',
		amount: Number(data?.data?.amount),
		currency: data?.data?.currency,
		txRef: data?.data?.tx_ref
	};
}
