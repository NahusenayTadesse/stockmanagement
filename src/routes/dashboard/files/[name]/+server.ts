import { error, redirect } from '@sveltejs/kit';
import { GET as serveFile } from '@nahu/admin-kit/server/serveFile';
import { ownsFile } from '$lib/server/transactions';
import type { RequestHandler } from './$types';

/**
 * Uploaded files — transfer screenshots, receipts — served only to the business that uploaded
 * them. The kit's handler serves any stored file to any signed-in user, which in a system shared
 * by many businesses would let one open another's bank screenshots from a copied link.
 *
 * A file that no table claims for the viewer's business is a 404, the same as a missing one.
 */
export const GET: RequestHandler = async (event) => {
	if (!event.locals.user) redirect(302, '/login');
	if (!event.locals.orgId || !(await ownsFile(event.locals.orgId, event.params.name))) {
		error(404, 'Not found');
	}
	return serveFile(event);
};
