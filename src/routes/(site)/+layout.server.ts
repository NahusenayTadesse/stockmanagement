import type { LayoutServerLoad } from './$types';

/** The public site shows a signed-in visitor the way back in, instead of "Sign in". */
export const load: LayoutServerLoad = async ({ locals }) => ({
	viewer: locals.user ? { name: locals.user.name, siteAdmin: locals.siteAdmin } : null
});
