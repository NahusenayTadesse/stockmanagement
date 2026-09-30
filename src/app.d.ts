import type { Session, User } from '$lib/server/auth';
import type { SubscriptionSummary } from '$lib/server/billing/subscriptions';

declare global {
	namespace App {
		interface Locals {
			user?: User | null;
			session?: Session | null;
			/** The viewer's business, from their user row. See `$lib/server/tenant`. */
			orgId: number | null;
			permList: string[];
			isSuperAdmin: boolean;
			/** Digital Construct's own staff: may open `/admin`. */
			siteAdmin: boolean;
			/**
			 * The viewer's business's subscription today, set for requests under `/dashboard`. The
			 * gate in `hooks.server.ts` has already turned a blocked business away by then.
			 */
			subscription: SubscriptionSummary | null;
		}
		interface PageData {
			flash?: { type: 'success' | 'error'; message: string };
		}
	}
}

export {};
