/**
 * What a business is subscribed to, and whether it may work today.
 *
 * The state is never stored: it is read off the `subscription` row and the day by
 * `subscriptionState` (`$lib/billing`), here and in the browser alike. Used by the request gate in
 * `hooks.server.ts`, by registration, by the owner's Subscription page and by the site admin.
 *
 * Seed-safe: imports nothing from SvelteKit or the kit's form helpers, so `scripts/seed.ts` can
 * use it under tsx.
 */
import { and, asc, count, eq, isNull } from 'drizzle-orm';
import { localToday } from '@nahu/admin-kit/time';
import { db } from '$lib/server/db';
import { branch, servicePackage, subscription, user } from '$lib/server/db/schema';
import { addDays, subscriptionState, type SubscriptionState } from '$lib/billing';
import { m } from '$lib/paraglide/messages.js';
import type { Tx } from '$lib/server/stock/ledger';

type Reader = Pick<typeof db, 'select'>;

/** What the pricing page, the register form and the payment form need to know about a package. */
const packageColumns = {
	id: servicePackage.id,
	name: servicePackage.name,
	slug: servicePackage.slug,
	description: servicePackage.description,
	price: servicePackage.price,
	billingMonths: servicePackage.billingMonths,
	maxUsers: servicePackage.maxUsers,
	maxBranches: servicePackage.maxBranches,
	trialDays: servicePackage.trialDays,
	highlights: servicePackage.highlights,
	isFeatured: servicePackage.isFeatured
};

const onSale = and(eq(servicePackage.isActive, true), isNull(servicePackage.deletedAt));

/** The packages a business can choose, in the order the site admin gave them. */
export async function packagesOnSale(reader: Reader = db) {
	const rows = await reader
		.select(packageColumns)
		.from(servicePackage)
		.where(onSale)
		.orderBy(asc(servicePackage.sortOrder), asc(servicePackage.price));
	return rows.map((row) => ({ ...row, highlights: row.highlights ?? [] }));
}
export type PackageOnSale = Awaited<ReturnType<typeof packagesOnSale>>[number];

/** One package on sale, by id; undefined for a retired or unknown one. */
export async function packageOnSale(id: number, reader: Reader = db) {
	const [row] = await reader
		.select(packageColumns)
		.from(servicePackage)
		.where(and(eq(servicePackage.id, id), onSale));
	return row ? { ...row, highlights: row.highlights ?? [] } : undefined;
}

/**
 * A business's subscription with its package and today's state, or null when it has none yet.
 * The package is read whether or not it is still on sale: a business keeps what it subscribed to.
 */
export async function subscriptionOf(orgId: number, reader: Reader = db, today = localToday()) {
	const [row] = await reader
		.select({
			id: subscription.id,
			orgId: subscription.orgId,
			startedOn: subscription.startedOn,
			trialEndsOn: subscription.trialEndsOn,
			paidUntil: subscription.paidUntil,
			complimentary: subscription.complimentary,
			suspendedAt: subscription.suspendedAt,
			suspendedReason: subscription.suspendedReason,
			package: packageColumns
		})
		.from(subscription)
		.innerJoin(servicePackage, eq(servicePackage.id, subscription.packageId))
		.where(eq(subscription.orgId, orgId));
	if (!row) return null;
	return {
		...row,
		package: { ...row.package, highlights: row.package.highlights ?? [] },
		state: subscriptionState(row, today)
	};
}
export type SubscriptionView = NonNullable<Awaited<ReturnType<typeof subscriptionOf>>>;

/** What the dashboard's banner and the blocked page need; small enough to send to every page. */
export type SubscriptionSummary = SubscriptionState & {
	packageName: string;
	paidUntil: string;
	suspendedReason: string | null;
};

export function summaryOf(view: SubscriptionView): SubscriptionSummary {
	return {
		...view.state,
		packageName: view.package.name,
		paidUntil: view.paidUntil,
		suspendedReason: view.suspendedReason
	};
}

/**
 * Starts a business on a package with its free trial (or for free, for good: `complimentary`).
 * Runs in the caller's transaction, next to `createOrganization`, so a business never exists
 * without a subscription.
 */
export async function startSubscription(
	tx: Tx,
	orgId: number,
	packageId: number,
	options: { today?: string; complimentary?: boolean } = {}
) {
	const today = options.today ?? localToday();
	const [pkg] = await tx
		.select({ trialDays: servicePackage.trialDays })
		.from(servicePackage)
		.where(eq(servicePackage.id, packageId));
	if (!pkg) throw new Error(`Package #${packageId} not found`);

	const trialEndsOn = addDays(today, Math.max(0, pkg.trialDays));
	await tx.insert(subscription).values({
		orgId,
		packageId,
		startedOn: today,
		trialEndsOn: options.complimentary ? null : trialEndsOn,
		paidUntil: trialEndsOn,
		complimentary: options.complimentary ?? false
	});
}

/**
 * The subscription of a business that may predate subscriptions: made on the spot, as a trial on
 * the first package on sale, when there is none. Returns null only when no package exists at all.
 */
export async function ensureSubscription(orgId: number) {
	const existing = await subscriptionOf(orgId);
	if (existing) return existing;

	const [first] = await packagesOnSale();
	if (!first) return null;
	try {
		await db.transaction((tx) => startSubscription(tx, orgId, first.id));
	} catch (err) {
		// Two requests raced here and the other one won: `org_id` is unique.
		if ((err as { code?: string })?.code !== 'ER_DUP_ENTRY') throw err;
	}
	return subscriptionOf(orgId);
}

/** How many of its package's places a business is using. */
export async function seatUsage(orgId: number, reader: Reader = db) {
	const [[people], [places]] = await Promise.all([
		reader
			.select({ total: count() })
			.from(user)
			.where(and(eq(user.orgId, orgId), eq(user.isActive, true), isNull(user.deletedAt))),
		reader
			.select({ total: count() })
			.from(branch)
			.where(and(eq(branch.orgId, orgId), isNull(branch.deletedAt)))
	]);
	return { users: Number(people.total), branches: Number(places.total) };
}

/**
 * Why one more user (or branch) cannot be added under the business's package, or null when there
 * is room. `adding` is how many the change adds: 0 when an existing one is only being edited.
 */
export async function seatRefusal(
	orgId: number,
	kind: 'user' | 'branch',
	adding = 1,
	reader: Reader = db
): Promise<string | null> {
	if (adding <= 0) return null;
	const view = await subscriptionOf(orgId, reader);
	if (!view) return null;

	const max = kind === 'user' ? view.package.maxUsers : view.package.maxBranches;
	if (max === null) return null;

	const usage = await seatUsage(orgId, reader);
	const used = kind === 'user' ? usage.users : usage.branches;
	if (used + adding <= max) return null;

	return kind === 'user'
		? m.billing_limit_users({ package: view.package.name, max })
		: m.billing_limit_branches({ package: view.package.name, max });
}
