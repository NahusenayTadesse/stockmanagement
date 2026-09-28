import { sequence } from '@sveltejs/kit/hooks';
import { building } from '$app/environment';
import { svelteKitHandler } from 'better-auth/svelte-kit';
import type { Handle } from '@sveltejs/kit';
import { configureKit } from '@nahu/admin-kit/server/db';
import { kitHandle } from '@nahu/admin-kit/server/hooks';

import { auth } from '$lib/server/auth';
import { db } from '$lib/server/db';
import { auditLog } from '$lib/server/db/schema';
import { getTextDirection } from '$lib/paraglide/runtime';
import { paraglideMiddleware } from '$lib/paraglide/server';
import { access } from '$lib/access';
import { loadGrant } from '$lib/server/permissions';
import { seedPaymentMethods, seedPermissions } from '$lib/server/seedPermissions';

configureKit({ db, auditLog, loginPath: '/login' });

const handleParaglide: Handle = ({ event, resolve }) =>
	paraglideMiddleware(event.request, ({ request, locale }) => {
		event.request = request;

		return resolve(event, {
			transformPageChunk: ({ html }) =>
				html
					.replace('%paraglide.lang%', locale)
					.replace('%paraglide.dir%', getTextDirection(locale))
		});
	});

/**
 * Closes the better-auth endpoints nobody may call over HTTP:
 *
 *   - sign-up: a new business registers through `/register`, which creates the business and its
 *     owner together; staff accounts are created from the Users screen
 *   - the admin plugin: list, ban, impersonate, set password… act on *every* user in the
 *     database, across businesses. The app calls `createUser` on the server only.
 */
const handleClosedEndpoints: Handle = async ({ event, resolve }) => {
	const path = event.url.pathname;
	if (path.startsWith('/api/auth/sign-up') || path.startsWith('/api/auth/admin')) {
		return new Response('Not found', { status: 404 });
	}
	return resolve(event);
};

/**
 * Brings the `permissions` table in step with the code on the first request after a boot, so a
 * permission added with a new route exists everywhere and every owner holds it. Logged and
 * swallowed on failure: the app should open and say what is wrong rather than not start.
 */
let permissionSync: Promise<void> | undefined;
function syncPermissionsOnce() {
	if (building) return;
	permissionSync ??= seedPermissions(db)
		.then(async (result) => {
			if (result.permissionsCreated) {
				console.log(`[permissions] seeded ${result.permissionsCreated} new permission(s)`);
			}
			const backfilled = await seedPaymentMethods(db);
			if (backfilled) console.log(`[payment methods] gave ${backfilled} business(es) the defaults`);
		})
		.catch((err) => console.error('[permissions] sync failed:', err));
	return permissionSync;
}

const handleBetterAuth: Handle = async ({ event, resolve }) => {
	await syncPermissionsOnce();

	const result = await auth.api.getSession({ headers: event.request.headers });
	event.locals.user = result?.user ?? null;
	event.locals.session = result?.session ?? null;
	// From the user row, never the request: the one value every tenant query trusts.
	event.locals.orgId = result?.user?.orgId ?? null;

	return svelteKitHandler({ event, resolve, auth, building });
};

/** Permissions from the user's role (or their own grants), then the kit's route gate. */
const handleKit = kitHandle({
	access,
	permissions: (event) =>
		event.locals.user ? loadGrant(event.locals.user.id) : { permList: [], isSuperAdmin: false }
});

export const handle: Handle = sequence(
	handleParaglide,
	handleClosedEndpoints,
	handleBetterAuth,
	handleKit
);
