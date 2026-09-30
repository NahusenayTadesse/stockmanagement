/**
 * The platform side of the demo: the packages, the site admin's account, the accounts transfers
 * are paid into, and a subscription for each demo business in a different state — one paid up,
 * one late with a transfer receipt waiting to be checked, one blocked after its trial.
 */
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { and, asc, count, eq } from 'drizzle-orm';
import { addLocalDays, localToday } from '@nahu/admin-kit/time';
import {
	organization,
	platformBankAccount,
	roles,
	servicePackage,
	subscription,
	subscriptionPayment,
	user
} from '$lib/server/db/schema';
import { addMonths } from '$lib/billing';
import { ensureSiteAdmin, seedPackages } from '$lib/server/billing/platform';
import type { Tx } from '$lib/server/stock/post';
import { createBusiness, addUser, FILES_DIR, PASSWORD, samplePdf, type Business } from './helpers';

type Database = typeof import('$lib/server/db').db;

/** The site admin the seed makes when `SITE_ADMIN_EMAIL` is not set. */
export const DEMO_SITE_ADMIN = 'admin@digitalconstruct.io';

const day = (offset: number) => addLocalDays(localToday(), offset);

/** Made-up accounts, named so nobody mistakes them for where to send money. */
const DEMO_BANK_ACCOUNTS = [
	{
		bankName: 'Commercial Bank of Ethiopia',
		accountName: 'Digital Construct (demo account)',
		accountNumber: '1000 1234 56789',
		sortOrder: 10
	},
	{
		bankName: 'Awash Bank',
		accountName: 'Digital Construct (demo account)',
		accountNumber: '0132 0456 7890 00',
		sortOrder: 20
	}
];

/** Packages, the site admin and the demo bank accounts. Adds what is missing; changes nothing. */
export async function seedPlatform(db: Database) {
	const packages = await seedPackages(db);

	const email = process.env.SITE_ADMIN_EMAIL?.trim() || DEMO_SITE_ADMIN;
	const siteAdmin = await ensureSiteAdmin(db, {
		email,
		password: process.env.SITE_ADMIN_PASSWORD || PASSWORD,
		name: process.env.SITE_ADMIN_NAME || 'Digital Construct Admin'
	});

	const [{ total }] = await db.select({ total: count() }).from(platformBankAccount);
	if (!Number(total)) await db.insert(platformBankAccount).values(DEMO_BANK_ACCOUNTS);

	return {
		packages,
		siteAdmin,
		email,
		bankAccounts: Number(total) ? 0 : DEMO_BANK_ACCOUNTS.length
	};
}

/** A shop that registered, tried the system and never paid: what "blocked" looks like. */
export const LAPSED = 'Kolfe Spare Parts';
export const LAPSED_OWNER = 'mulu@spares.example.com';

export async function seedLapsed(tx: Tx): Promise<Business> {
	const biz = await createBusiness(tx, {
		name: LAPSED,
		tin: '0067812345',
		phone: '+251 91 145 6677',
		address: 'Kolfe Keranio, Addis Ababa',
		main: {
			name: 'Kolfe',
			code: 'KLF',
			address: 'Kolfe 18 Mazoria',
			phone: '+251 91 145 6677',
			store: 'Kolfe Store'
		}
	});
	await addUser(tx, biz, {
		key: 'mulu',
		name: 'Mulu Gebre',
		email: LAPSED_OWNER,
		role: 'Owner',
		branch: 'KLF'
	});
	return biz;
}

/** What a demo business's subscription should look like today. */
export type DemoBilling =
	/** Paid twice through Chapa, with most of the second period still to run. */
	| 'active'
	/** Its period ended three days ago; a bank transfer receipt is waiting to be checked. */
	| 'due'
	/** The free trial ended five days ago and nothing was paid. */
	| 'lapsed';

/**
 * Sets a demo business's subscription and payment history, replacing whatever it had. Dates are
 * worked backwards from today, so the states stay what they are meant to show whenever the seed
 * is run. Only ever called on the businesses this seed made, by their owner's email.
 */
export async function seedBilling(db: Database, ownerEmail: string, kind: DemoBilling) {
	const [owner] = await db
		.select({ id: user.id, orgId: user.orgId })
		.from(user)
		.innerJoin(roles, eq(roles.id, user.roleId))
		.where(and(eq(user.email, ownerEmail), eq(roles.isOwner, true)));
	if (!owner) return false;

	const slug = kind === 'lapsed' ? 'starter' : 'growth';
	const [pkg] = await db.select().from(servicePackage).where(eq(servicePackage.slug, slug));
	if (!pkg) return false;
	const [account] = await db
		.select({ id: platformBankAccount.id })
		.from(platformBankAccount)
		.orderBy(asc(platformBankAccount.sortOrder))
		.limit(1);
	const [org] = await db
		.select({ name: organization.name })
		.from(organization)
		.where(eq(organization.id, owner.orgId));

	await db.transaction(async (tx) => {
		const stale = await tx
			.select({ fileName: subscriptionPayment.receiptFile })
			.from(subscriptionPayment)
			.where(eq(subscriptionPayment.orgId, owner.orgId));
		for (const { fileName } of stale) {
			if (fileName) fs.rmSync(path.join(FILES_DIR, fileName), { force: true });
		}
		await tx.delete(subscriptionPayment).where(eq(subscriptionPayment.orgId, owner.orgId));
		await tx.delete(subscription).where(eq(subscription.orgId, owner.orgId));

		if (kind === 'lapsed') {
			await tx.insert(subscription).values({
				orgId: owner.orgId,
				packageId: pkg.id,
				startedOn: day(-5 - pkg.trialDays),
				trialEndsOn: day(-5),
				paidUntil: day(-5)
			});
			return;
		}

		// The periods already paid for, newest last, each `billingMonths` long and ending where
		// the next begins. `active` is in its second; `due` finished its first three days ago.
		const lastEnd = kind === 'active' ? day(80) : day(-3);
		const periods: { start: string; end: string }[] = [];
		let end = lastEnd;
		for (let i = 0; i < (kind === 'active' ? 2 : 1); i++) {
			const start = addMonths(addLocalDays(end, 1), -pkg.billingMonths);
			periods.unshift({ start, end });
			end = addLocalDays(start, -1);
		}
		const trialEndsOn = end;

		await tx.insert(subscription).values({
			orgId: owner.orgId,
			packageId: pkg.id,
			startedOn: addLocalDays(trialEndsOn, -pkg.trialDays),
			trialEndsOn,
			paidUntil: lastEnd
		});

		for (const [i, period] of periods.entries()) {
			// Paid two days before the period it bought began.
			const paidAt = new Date(`${addLocalDays(period.start, -2)}T10:30:00+03:00`);
			await tx.insert(subscriptionPayment).values({
				orgId: owner.orgId,
				packageId: pkg.id,
				amount: pkg.price,
				months: pkg.billingMonths,
				method: 'chapa',
				status: 'paid',
				txRef: `sm${owner.orgId}-demo${i + 1}${randomUUID().slice(0, 8)}`,
				periodStart: period.start,
				periodEnd: period.end,
				paidAt,
				createdBy: owner.id,
				createdAt: paidAt
			});
		}

		if (kind === 'due' && account) {
			const sentAt = new Date(`${day(-1)}T16:45:00+03:00`);
			const reference = `FT${day(-1).replaceAll('-', '').slice(2)}XK9P1`;
			const pdf = samplePdf('Bank transfer receipt (demo)', [
				`Date: ${day(-1)}`,
				`Amount: ETB ${pkg.price.toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
				`From: ${org?.name ?? ownerEmail}`,
				'To: Digital Construct (demo account)',
				`Reference: ${reference}`,
				`For: ${pkg.name} package, ${pkg.billingMonths} months`
			]);
			fs.mkdirSync(FILES_DIR, { recursive: true });
			const fileName = `${randomUUID()}.pdf`;
			fs.writeFileSync(path.join(FILES_DIR, fileName), pdf);

			await tx.insert(subscriptionPayment).values({
				orgId: owner.orgId,
				packageId: pkg.id,
				amount: pkg.price,
				months: pkg.billingMonths,
				method: 'bank',
				status: 'pending',
				bankAccountId: account.id,
				receiptFile: fileName,
				payerReference: reference,
				createdBy: owner.id,
				createdAt: sentAt
			});
		}
	});
	return true;
}
