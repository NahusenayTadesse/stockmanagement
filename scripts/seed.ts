/**
 * Demo businesses for trying the system: a hardware store and a tech store, each with branches,
 * staff on different roles, a catalogue, and a few months of receipts, transfers, sales,
 * write-offs and drafts — and a third that never paid after its trial, to show what a blocked
 * business sees. Also the platform's own data: packages, the site admin (`SITE_ADMIN_EMAIL`, or
 * admin@digitalconstruct.io), demo bank accounts, and each business's subscription.
 *
 *   npm run db:seed -- --yes            adds whichever of them is missing
 *   npm run db:seed -- --yes --fresh    removes them and builds them again
 *
 * Touches only the businesses it creates, by their owner's email. Refuses to run against anything but a
 * local database unless ALLOW_REMOTE_SEED=yes.
 */
import mysql from 'mysql2/promise';
import { eq, inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/mysql2';
import * as schema from '$lib/server/db/schema';
import { seedPaymentMethods, seedPermissions } from '$lib/server/seedPermissions';
import { businessExists, PASSWORD, removeBusiness, type Business } from './seed/helpers';
import { HARDWARE, seedHardware } from './seed/hardware';
import { seedTech, TECH } from './seed/tech';
import {
	LAPSED,
	LAPSED_OWNER,
	seedBilling,
	seedLapsed,
	seedPlatform,
	type DemoBilling
} from './seed/billing';
import type { Tx } from '$lib/server/stock/post';

const url = process.env.DATABASE_URL;
if (!url) {
	console.error('DATABASE_URL is not set.');
	process.exit(1);
}

const host = new URL(url.replace(/^mysql:\/\//, 'http://')).hostname;
if (!['localhost', '127.0.0.1', '::1'].includes(host) && process.env.ALLOW_REMOTE_SEED !== 'yes') {
	console.error(
		`Refusing to seed a non-local database (${host}). Set ALLOW_REMOTE_SEED=yes to override.`
	);
	process.exit(1);
}
if (!process.argv.includes('--yes')) {
	console.error(`This writes demo businesses into ${host}. Re-run with --yes to confirm.`);
	process.exit(1);
}
const fresh = process.argv.includes('--fresh');

const pool = mysql.createPool(url);
const db = drizzle(pool, { schema, mode: 'default' });

/**
 * Each demo business, known by its owner's email: the one thing its owner cannot rename. The last
 * column is what its subscription shows: paid up, late, or blocked after an unpaid trial.
 */
const BUSINESSES: [string, string, (tx: Tx) => Promise<Business>, DemoBilling][] = [
	[HARDWARE, 'dawit@hardware.example.com', seedHardware, 'active'],
	[TECH, 'samuel@tech.example.com', seedTech, 'due'],
	[LAPSED, LAPSED_OWNER, seedLapsed, 'lapsed']
];

try {
	// Roles are granted from the permissions table, so it must be current first.
	await seedPermissions(db);
	await seedPaymentMethods(db);

	// The platform itself: packages to subscribe to, the site admin, where transfers are paid.
	const platform = await seedPlatform(db);
	if (platform.packages) console.log(`✓ ${platform.packages} packages`);
	if (platform.bankAccounts) console.log(`✓ ${platform.bankAccounts} demo bank accounts`);
	console.log(
		platform.siteAdmin === 'exists'
			? `• site admin ${platform.email}: already there`
			: `✓ site admin ${platform.email} (${platform.siteAdmin})`
	);

	for (const [name, ownerEmail, build] of BUSINESSES) {
		// One transaction per business: a failure leaves no half-built one behind.
		const built = await db.transaction(async (tx) => {
			if (fresh) await removeBusiness(tx, ownerEmail);
			else if (await businessExists(tx, ownerEmail)) return null;
			return build(tx);
		});

		if (!built) {
			console.log(`• ${name}: already there (use --fresh to rebuild)`);
			continue;
		}
		console.log(`✓ ${name}: ${built.items.size} items, ${built.locations.size} locations`);
	}

	// Subscriptions are reset on every run: they are dated from today, and a demo store that
	// stayed "three days late" for a month would have blocked itself.
	for (const [name, ownerEmail, , billing] of BUSINESSES) {
		if (await seedBilling(db, ownerEmail, billing))
			console.log(`✓ ${name}: subscription ${billing}`);
	}

	const owners = await db
		.select({ orgId: schema.user.orgId })
		.from(schema.user)
		.where(
			inArray(
				schema.user.email,
				BUSINESSES.map(([, email]) => email)
			)
		);
	const people = await db
		.select({ email: schema.user.email, role: schema.roles.name, org: schema.organization.name })
		.from(schema.user)
		.innerJoin(schema.roles, eq(schema.roles.id, schema.user.roleId))
		.innerJoin(schema.organization, eq(schema.organization.id, schema.user.orgId))
		.where(
			inArray(
				schema.organization.id,
				owners.map((o) => o.orgId)
			)
		);
	console.log(`\nSign in with password ${PASSWORD}:`);
	for (const p of people) console.log(`  ${p.email.padEnd(30)} ${p.role.padEnd(12)} ${p.org}`);
} finally {
	await pool.end();
}
