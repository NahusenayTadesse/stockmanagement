// Chapa's webhook — the main way a subscription payment gets confirmed, since it does not depend
// on the payer's browser making it back to the site.
//
// The signature check filters out noise; it is not what decides that a payment counts. That is
// `settleOnlinePayment()`, which asks Chapa directly and checks the amount, so even a forged body
// that got past this could not extend anything.

import { json, text, type RequestHandler } from '@sveltejs/kit';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '$env/dynamic/private';
import { settleOnlinePayment } from '$lib/server/billing/payments';

/**
 * Chapa signs the raw body with HMAC-SHA256 under the webhook secret and sends the hex digest as
 * `Chapa-Signature` (older integrations: `x-chapa-signature`).
 */
function isSignatureValid(rawBody: string, signature: string | null, secret: string) {
	if (!signature) return false;
	const expected = Buffer.from(createHmac('sha256', secret).update(rawBody).digest('hex'));
	const given = Buffer.from(signature.trim());
	return given.length === expected.length && timingSafeEqual(given, expected);
}

export const POST: RequestHandler = async ({ request }) => {
	const secret = env.CHAPA_WEBHOOK_SECRET?.trim();
	if (!secret) {
		console.error('CHAPA_WEBHOOK_SECRET is not configured — rejecting webhook.');
		return json({ error: 'Webhook not configured.' }, { status: 500 });
	}

	// The raw bytes, not re-serialised JSON — that is what Chapa signed.
	const rawBody = await request.text();
	const signature =
		request.headers.get('chapa-signature') ?? request.headers.get('x-chapa-signature');

	if (!isSignatureValid(rawBody, signature, secret)) {
		console.warn('Rejected a Chapa webhook with a bad or missing signature.');
		return json({ error: 'Invalid signature.' }, { status: 401 });
	}

	let payload: { tx_ref?: string; trx_ref?: string; reference?: string };
	try {
		payload = JSON.parse(rawBody);
	} catch {
		return json({ error: 'Malformed payload.' }, { status: 400 });
	}

	const txRef = payload.tx_ref ?? payload.trx_ref ?? payload.reference;
	if (!txRef) return json({ error: 'No transaction reference.' }, { status: 400 });

	try {
		const outcome = await settleOnlinePayment(txRef);

		// Chapa only retries on a non-2xx, so "not confirmed yet" and "Chapa unreachable" get a
		// 503. Things a retry cannot change are acknowledged.
		if (outcome.status === 'pending') {
			if (outcome.retryable) {
				return json(
					{ received: true, settled: false },
					{ status: 503, headers: { 'Retry-After': '60' } }
				);
			}
			console.warn(`Chapa webhook for ${txRef} not settled: ${outcome.reason}`);
		}
		return json({ received: true, settled: outcome.status === 'paid' });
	} catch (err) {
		console.error('Chapa webhook processing failed:', err);
		return json({ error: 'Could not process webhook.' }, { status: 500 });
	}
};

/** Chapa's dashboard probes the URL with a GET before saving it. */
export const GET: RequestHandler = async () => text('ok');
