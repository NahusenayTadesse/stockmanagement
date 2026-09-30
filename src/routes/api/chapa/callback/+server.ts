import { json, type RequestHandler } from '@sveltejs/kit';
import { settleOnlinePayment } from '$lib/server/billing/payments';

/**
 * Chapa's `callback_url`: called server to server once a checkout finishes, with the reference in
 * the query string. Like the webhook, it only *triggers* a check — `settleOnlinePayment()`
 * verifies with Chapa before anything counts — so it needs no signature.
 */
export const GET: RequestHandler = async ({ url }) => {
	const txRef = url.searchParams.get('trx_ref') ?? url.searchParams.get('tx_ref');
	if (!txRef) return json({ error: 'No transaction reference.' }, { status: 400 });

	const outcome = await settleOnlinePayment(txRef);
	return json({ settled: outcome.status === 'paid' });
};
