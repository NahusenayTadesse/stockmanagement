import { env } from '$env/dynamic/private';
import type { LayoutServerLoad } from './$types';

/** The public site shows a signed-in visitor the way back in, instead of "Sign in". */
export const load: LayoutServerLoad = async ({ locals, url }) => ({
	canonical: new URL(url.pathname, env.ORIGIN || url.origin).href,
	origin: new URL(env.ORIGIN || url.origin).origin,
	viewer: locals.user ? { name: locals.user.name, siteAdmin: locals.siteAdmin } : null
});
