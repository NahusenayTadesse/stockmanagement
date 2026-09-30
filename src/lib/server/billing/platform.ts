/**
 * What the platform itself needs before anyone can subscribe: packages to choose from, a
 * subscription for every business, and the site admin's account.
 *
 * All three are idempotent and additive. They run on the first request after a boot (see
 * `hooks.server.ts`) and from `npm run db:seed`, so a fresh database and an old one both end up
 * complete. Seed-safe: no SvelteKit imports.
 */
import { randomUUID } from 'node:crypto';
import { count, eq, sql } from 'drizzle-orm';
import { hashPassword } from 'better-auth/crypto';
import { account, organization, servicePackage, subscription, user } from '$lib/server/db/schema';
import { createOrganization } from '$lib/server/seedPermissions';
import { packagesOnSale, startSubscription } from './subscriptions';

type Database = typeof import('$lib/server/db').db;

/** The business the site admin's account lives in. It never pays: its subscription is complimentary. */
export const PLATFORM_BUSINESS = 'Digital Construct';

/**
 * The packages a new installation starts with. Ordinary rows afterwards: the site admin renames,
 * reprices and retires them from Site admin → Packages. Every package opens the whole
 * application; they differ in people, branches and how often they are paid.
 */
export const DEFAULT_PACKAGES: (typeof servicePackage.$inferInsert)[] = [
	{
		name: 'Starter',
		slug: 'starter',
		description: 'One shop or store, run by a small team.',
		price: 1200,
		billingMonths: 1,
		maxUsers: 3,
		maxBranches: 1,
		trialDays: 14,
		highlights: ['Email support'],
		sortOrder: 10
	},
	{
		name: 'Growth',
		slug: 'growth',
		description: 'A business with a second branch and separate roles for store and till.',
		price: 6900,
		billingMonths: 3,
		maxUsers: 8,
		maxBranches: 3,
		trialDays: 14,
		highlights: ['Email and phone support', 'Help importing your items and opening stock'],
		sortOrder: 20
	},
	{
		name: 'Business',
		slug: 'business',
		description: 'Several branches, approvals between people, and a full year at a lower price.',
		price: 42000,
		billingMonths: 12,
		maxUsers: 20,
		maxBranches: 10,
		trialDays: 14,
		highlights: [
			'Priority phone support',
			'Help importing your items and opening stock',
			'Training session for your staff'
		],
		isFeatured: true,
		sortOrder: 30
	},
	{
		name: 'Enterprise',
		slug: 'enterprise',
		description:
			'No limit on people or branches, for distributors and organisations with many stores.',
		price: 96000,
		billingMonths: 12,
		maxUsers: null,
		maxBranches: null,
		trialDays: 14,
		highlights: [
			'Priority phone support',
			'On-site setup and training',
			'A named contact at Digital Construct'
		],
		sortOrder: 40
	}
];

/** Adds the default packages to a database that has never had any. Returns how many it added. */
export async function seedPackages(db: Database): Promise<number> {
	// Counted with retired and deleted ones: a site admin who removed them all meant it.
	const [{ total }] = await db.select({ total: count() }).from(servicePackage);
	if (Number(total)) return 0;
	await db.insert(servicePackage).values(DEFAULT_PACKAGES);
	return DEFAULT_PACKAGES.length;
}

/**
 * Gives every business without a subscription a trial starting today, on the first package on
 * sale. For businesses registered before subscriptions existed; registration makes its own.
 */
export async function backfillSubscriptions(db: Database): Promise<number> {
	const [first] = await packagesOnSale(db);
	if (!first) return 0;

	const orgs = await db
		.select({ id: organization.id })
		.from(organization)
		.where(
			sql`NOT EXISTS (SELECT 1 FROM ${subscription} WHERE ${subscription.orgId} = ${organization.id})`
		);
	for (const org of orgs) {
		await db.transaction((tx) => startSubscription(tx, org.id, first.id));
	}
	return orgs.length;
}

/**
 * Makes sure the site admin's account exists: a user flagged `siteAdmin`, owner of the platform's
 * own business. An account already using the email is promoted rather than duplicated; an existing
 * account's password is never changed from here.
 */
export async function ensureSiteAdmin(
	db: Database,
	input: { email: string; password: string; name?: string }
): Promise<'created' | 'promoted' | 'exists'> {
	const email = input.email.trim().toLowerCase();

	const [existing] = await db
		.select({ id: user.id, siteAdmin: user.siteAdmin })
		.from(user)
		.where(eq(user.email, email));
	if (existing?.siteAdmin) return 'exists';
	if (existing) {
		await db.update(user).set({ siteAdmin: true }).where(eq(user.id, existing.id));
		return 'promoted';
	}

	const [top] = (await packagesOnSale(db)).slice(-1);
	if (!top) throw new Error('No package exists yet: run seedPackages first.');
	const passwordHash = await hashPassword(input.password);

	await db.transaction(async (tx) => {
		// Another site admin's business, when there is one: they are colleagues, not a new company.
		const [platform] = await tx
			.select({ orgId: user.orgId, roleId: user.roleId, branchId: user.branchId })
			.from(user)
			.where(eq(user.siteAdmin, true))
			.limit(1);

		let home = platform;
		if (!home) {
			const created = await createOrganization(tx, { name: PLATFORM_BUSINESS });
			await startSubscription(tx, created.orgId, top.id, { complimentary: true });
			home = { orgId: created.orgId, roleId: created.ownerRoleId, branchId: created.branchId };
		}

		const id = randomUUID().replace(/-/g, '');
		await tx.insert(user).values({
			id,
			name: input.name?.trim() || 'Site admin',
			email,
			emailVerified: true,
			orgId: home.orgId,
			roleId: home.roleId,
			branchId: home.branchId,
			role: 'user',
			siteAdmin: true
		});
		await tx.insert(account).values({
			id: randomUUID().replace(/-/g, ''),
			accountId: id,
			providerId: 'credential',
			userId: id,
			password: passwordHash
		});
	});
	return 'created';
}

/**
 * Everything above, in order. `env` supplies the site admin's login (`SITE_ADMIN_EMAIL`,
 * `SITE_ADMIN_PASSWORD`, optionally `SITE_ADMIN_NAME`); without both, no account is made here.
 */
export async function syncPlatform(
	db: Database,
	env: Record<string, string | undefined>
): Promise<{ packages: number; subscriptions: number; siteAdmin: string | null }> {
	const packages = await seedPackages(db);

	let siteAdmin: string | null = null;
	const email = env.SITE_ADMIN_EMAIL?.trim();
	const password = env.SITE_ADMIN_PASSWORD;
	if (email && password) {
		const outcome = await ensureSiteAdmin(db, { email, password, name: env.SITE_ADMIN_NAME });
		if (outcome !== 'exists') siteAdmin = `${email} (${outcome})`;
	}

	// After the site admin, so the platform's own business already has its complimentary one.
	const subscriptions = await backfillSubscriptions(db);
	return { packages, subscriptions, siteAdmin };
}
