import { env } from '$env/dynamic/private';
import { betterAuth } from 'better-auth/minimal';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { sveltekitCookies } from 'better-auth/svelte-kit';
import { admin } from 'better-auth/plugins';
import { APIError } from 'better-auth/api';
import { and, eq, isNull } from 'drizzle-orm';
import { getRequestEvent } from '$app/server';

import { db } from '$lib/server/db';
import { sendMail } from '$lib/server/mail';
import * as schema from '$lib/server/db/schema';

export const auth = betterAuth({
	baseURL: env.ORIGIN,
	secret: env.BETTER_AUTH_SECRET,

	// `schema`, so the adapter sees the app's own `user` table with its extra columns.
	database: drizzleAdapter(db, { provider: 'mysql', schema }),

	emailAndPassword: {
		enabled: true,
		minPasswordLength: 8,

		/**
		 * "Forgot password": better-auth issues the token and the link, this sends it. The link goes
		 * to /api/auth/reset-password/:token, which checks it and forwards to /reset-password.
		 */
		sendResetPassword: async ({ user, url }) => {
			await sendMail(user.email, {
				subject: 'Reset your password',
				body: [
					`Hello ${user.name},`,
					'Someone asked to reset the password for your stock management account. The link works for one hour and only once.'
				],
				action: { label: 'Choose a new password', url },
				footnote: 'If this was not you, ignore this email — your password stays as it is.'
			});
		},
		resetPasswordTokenExpiresIn: 60 * 60,
		// Whoever reset it may have lost control of a device; every open session ends.
		revokeSessionsOnPasswordReset: true,
		onPasswordReset: async ({ user }) => {
			await sendMail(user.email, {
				subject: 'Your password was changed',
				body: [
					`Hello ${user.name},`,
					'The password for your stock management account has just been reset, and every device signed in as you was signed out.'
				],
				footnote: 'If you did not do this, contact your business owner straight away.'
			});
		}
	},

	rateLimit: {
		window: 60,
		max: 60,
		storage: 'memory',
		customRules: {
			'/sign-in/email': { window: 5 * 60, max: 10 },
			// It mails an address of the caller's choosing from our account.
			'/request-password-reset': { window: 5 * 60, max: 5 }
		}
	},

	user: {
		/**
		 * The app's columns on `user`. `input: true` is safe only because the public sign-up
		 * endpoint is closed in `hooks.server.ts`: accounts are created by `/register` (which makes
		 * a new business) and by the Users screen, both on the server, both deciding these values
		 * themselves.
		 */
		additionalFields: {
			orgId: { type: 'number', required: true, input: true },
			roleId: { type: 'number', required: true, input: true },
			branchId: { type: 'number', required: false, input: true },
			isActive: { type: 'boolean', required: false, input: false, defaultValue: true }
		}
	},

	databaseHooks: {
		session: {
			create: {
				/**
				 * A deactivated or deleted user, or anyone in a suspended business, cannot sign in.
				 * The admin plugin checks only its own `banned` flag.
				 */
				before: async (session) => {
					const [row] = await db
						.select({ isActive: schema.user.isActive, orgActive: schema.organization.isActive })
						.from(schema.user)
						.innerJoin(schema.organization, eq(schema.organization.id, schema.user.orgId))
						.where(and(eq(schema.user.id, session.userId), isNull(schema.user.deletedAt)))
						.limit(1);

					if (!row || !row.isActive || !row.orgActive) {
						throw new APIError('UNAUTHORIZED', { message: 'This account is not active.' });
					}
					return { data: session };
				}
			}
		}
	},

	plugins: [
		/**
		 * Only for `auth.api.createUser`, called from the Users screen without request headers —
		 * the plugin allows that from the server. Its HTTP endpoints act on every user in the
		 * database regardless of business, so `hooks.server.ts` closes all of them.
		 */
		admin({ defaultRole: 'user', adminRoles: ['admin'] }),
		sveltekitCookies(getRequestEvent) // must stay last
	]
});

export type Session = typeof auth.$Infer.Session.session;
export type User = typeof auth.$Infer.Session.user;
