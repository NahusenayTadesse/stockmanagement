import { sequence } from '@sveltejs/kit/hooks';
import { building } from '$app/environment';
import { env } from '$env/dynamic/private';
import { svelteKitHandler } from 'better-auth/svelte-kit';
import { error, redirect, type Handle } from '@sveltejs/kit';
import { configureKit } from '@nahu/admin-kit/server/db';
import { kitHandle } from '@nahu/admin-kit/server/hooks';

import { auth } from '$lib/server/auth';
import { db } from '$lib/server/db';
import { auditLog } from '$lib/server/db/schema';
import { getTextDirection } from '$lib/paraglide/runtime';
import { paraglideMiddleware } from '$lib/paraglide/server';
import { access, adminAccess } from '$lib/access';
import { kitServerLabels } from '$lib/kitLabels';
import { m } from '$lib/paraglide/messages.js';
import { loadGrant } from '$lib/server/permissions';
import { seedPaymentMethods, seedPermissions } from '$lib/server/seedPermissions';
import { syncPlatform } from '$lib/server/billing/platform';
import { ensureSubscription, summaryOf } from '$lib/server/billing/subscriptions';

// The kit's own server messages ("Unit saved", refusals) in the viewer's language.
configureKit({ db, auditLog, loginPath: '/login', labels: kitServerLabels });

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

			// After the permissions: the site admin's business is made with its owner role's grants.
			const platform = await syncPlatform(db, env);
			if (platform.packages) console.log(`[platform] added ${platform.packages} default packages`);
			if (platform.siteAdmin) console.log(`[platform] site admin: ${platform.siteAdmin}`);
			if (platform.subscriptions) {
				console.log(`[platform] started a trial for ${platform.subscriptions} business(es)`);
			}
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
	event.locals.siteAdmin = Boolean(result?.user?.siteAdmin);
	event.locals.subscription = null;

	return svelteKitHandler({ event, resolve, auth, building });
};

/** Permissions from the user's role (or their own grants), then the kit's route gate. */
const handleKit = kitHandle({
	access,
	permissions: (event) =>
		event.locals.user ? loadGrant(event.locals.user.id) : { permList: [], isSuperAdmin: false }
});

/**
 * The site admin (`/admin`) is for Digital Construct's own accounts. Signed out is sent to sign
 * in; signed in as anyone else is a 404, so the console does not announce itself to a business's
 * owner who guesses the address. Here rather than in the layout for the reason `kitHandle` gives:
 * a layout's `load` never runs for a form action's POST or a `+server.ts`.
 */
const handleSiteAdmin: Handle = async ({ event, resolve }) => {
	if (!adminAccess.guards(event.url.pathname)) return resolve(event);

	if (!event.locals.user) {
		if (event.request.method === 'GET' || event.request.method === 'HEAD') {
			const target = encodeURIComponent(event.url.pathname + event.url.search);
			redirect(302, `/login?redirectTo=${target}`);
		}
		error(401, m.billing_sign_in_first());
	}
	if (!event.locals.siteAdmin) error(404, m.common_not_found());
	return resolve(event);
};

/** What a business whose subscription has lapsed can still reach: paying, and leaving. */
const OPEN_WHEN_BLOCKED = [
	'/dashboard/subscription',
	'/dashboard/change-password',
	'/dashboard/help'
];

/**
 * The subscription gate. A business that has not paid (or was suspended) keeps its sign-in and
 * its data, and every request under `/dashboard` is turned to the Subscription page, where the
 * owner sees why and can pay. Form actions and endpoints are refused outright: a redirect would
 * let the POST through to nowhere and look like it worked.
 *
 * Runs after the kit's gate, so `locals.subscription` is there for every dashboard page that
 * does open — the layout's banner reads it.
 */
const handleSubscription: Handle = async ({ event, resolve }) => {
	const { locals, url, request } = event;
	if (!locals.user || !locals.orgId || !access.guards(url.pathname)) return resolve(event);

	const view = await ensureSubscription(locals.orgId);
	if (!view) return resolve(event);
	locals.subscription = summaryOf(view);
	if (view.state.allowed) return resolve(event);

	const path = url.pathname.replace(/\/+$/, '') || '/';
	if (OPEN_WHEN_BLOCKED.some((open) => path === open || path.startsWith(open + '/'))) {
		return resolve(event);
	}
	// Signing out is an action on the dashboard's own page.
	if (request.method === 'POST' && path === '/dashboard' && url.searchParams.has('/logout')) {
		return resolve(event);
	}
	// The business's own files: the receipt it uploaded, shown on the Subscription page.
	if (request.method === 'GET' && path.startsWith('/dashboard/files/')) return resolve(event);

	if (request.method === 'GET' || request.method === 'HEAD') {
		redirect(303, '/dashboard/subscription');
	}
	error(402, m.billing_blocked_action());
};

export const handle: Handle = sequence(
	handleParaglide,
	handleClosedEndpoints,
	handleBetterAuth,
	handleSiteAdmin,
	handleKit,
	handleSubscription
);
