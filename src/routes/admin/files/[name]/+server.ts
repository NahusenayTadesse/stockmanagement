import { error } from '@sveltejs/kit';
import { GET as serveFile } from '@nahu/admin-kit/server/serveFile';
import { isReceipt } from '$lib/server/billing/payments';
import type { RequestHandler } from './$types';

/**
 * Transfer receipts, for the site admin checking them. Only receipts: a business's other uploads
 * (its logo, its own transactions' screenshots) are its own, and not served here. `hooks.server.ts`
 * has already closed `/admin` to everyone else.
 */
export const GET: RequestHandler = async (event) => {
	if (!event.locals.siteAdmin || !(await isReceipt(event.params.name))) error(404, 'Not found');
	return serveFile(event);
};
