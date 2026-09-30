import type { LayoutServerLoad } from './$types';

/**
 * The site admin. `hooks.server.ts` has already turned away everyone who is not one — signed out
 * to the sign-in page, anyone else with a 404 — for page views and form actions alike.
 */
export const load: LayoutServerLoad = async ({ locals }) => ({
	user: { id: locals.user!.id, name: locals.user!.name, email: locals.user!.email },
	isSuperAdmin: locals.isSuperAdmin
});
