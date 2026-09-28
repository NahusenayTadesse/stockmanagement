import type { Session, User } from '$lib/server/auth';

declare global {
	namespace App {
		interface Locals {
			user?: User | null;
			session?: Session | null;
			/** The viewer's business, from their user row. See `$lib/server/tenant`. */
			orgId: number | null;
			permList: string[];
			isSuperAdmin: boolean;
		}
		interface PageData {
			flash?: { type: 'success' | 'error'; message: string };
		}
	}
}

export {};
