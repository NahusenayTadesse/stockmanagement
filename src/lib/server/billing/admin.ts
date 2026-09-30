/**
 * What the site admin sees and does: every business with its subscription, every payment, and the
 * changes only Digital Construct makes (move a business to another package, extend it, suspend
 * it). Nothing here is scoped to a business — the routes under `/admin` are closed to everyone
 * but site admins in `hooks.server.ts`.
 */
import { and, asc, count, desc, eq, gte, isNull, max, sql, sum } from 'drizzle-orm';
import { localToday } from '@nahu/admin-kit/time';
import { db } from '$lib/server/db';
import {
	contactMessage,
	organization,
	platformBankAccount,
	roles,
	servicePackage,
	subscription,
	subscriptionPayment,
	user
} from '$lib/server/db/schema';
import { subscriptionState, type SubscriptionStatus } from '$lib/billing';
import { cents } from '$lib/money';

/** Every business, with its subscription's state today, its people and what it has paid. */
export async function businessRows(today = localToday()) {
	const [orgs, people, owners, paid, waiting] = await Promise.all([
		db
			.select({
				id: organization.id,
				name: organization.name,
				phone: organization.phone,
				tin: organization.tin,
				createdAt: organization.createdAt,
				packageId: subscription.packageId,
				packageName: servicePackage.name,
				maxUsers: servicePackage.maxUsers,
				startedOn: subscription.startedOn,
				trialEndsOn: subscription.trialEndsOn,
				paidUntil: subscription.paidUntil,
				complimentary: subscription.complimentary,
				suspendedAt: subscription.suspendedAt,
				suspendedReason: subscription.suspendedReason
			})
			.from(organization)
			.leftJoin(subscription, eq(subscription.orgId, organization.id))
			.leftJoin(servicePackage, eq(servicePackage.id, subscription.packageId))
			.orderBy(desc(organization.createdAt)),
		db
			.select({ orgId: user.orgId, total: count() })
			.from(user)
			.where(and(eq(user.isActive, true), isNull(user.deletedAt)))
			.groupBy(user.orgId),
		db
			.select({ orgId: user.orgId, name: user.name, email: user.email })
			.from(user)
			.innerJoin(roles, eq(roles.id, user.roleId))
			.where(and(eq(roles.isOwner, true), isNull(user.deletedAt)))
			.orderBy(asc(user.createdAt)),
		db
			.select({
				orgId: subscriptionPayment.orgId,
				total: sum(subscriptionPayment.amount),
				lastPaidAt: max(subscriptionPayment.paidAt)
			})
			.from(subscriptionPayment)
			.where(eq(subscriptionPayment.status, 'paid'))
			.groupBy(subscriptionPayment.orgId),
		db
			.select({ orgId: subscriptionPayment.orgId, total: count() })
			.from(subscriptionPayment)
			.where(and(eq(subscriptionPayment.method, 'bank'), eq(subscriptionPayment.status, 'pending')))
			.groupBy(subscriptionPayment.orgId)
	]);

	const usersOf = new Map(people.map((r) => [r.orgId, Number(r.total)]));
	const paidOf = new Map(paid.map((r) => [r.orgId, r]));
	const waitingOf = new Map(waiting.map((r) => [r.orgId, Number(r.total)]));
	// The first owner by date: the one who registered the business.
	const ownerOf = new Map<number, { name: string; email: string }>();
	for (const o of owners) if (!ownerOf.has(o.orgId)) ownerOf.set(o.orgId, o);

	return orgs.map((org) => {
		const state = org.paidUntil
			? subscriptionState(
					{
						paidUntil: org.paidUntil,
						trialEndsOn: org.trialEndsOn,
						complimentary: org.complimentary ?? false,
						suspendedAt: org.suspendedAt
					},
					today
				)
			: null;
		return {
			id: org.id,
			name: org.name,
			phone: org.phone,
			tin: org.tin,
			createdAt: org.createdAt,
			packageId: org.packageId,
			packageName: org.packageName,
			maxUsers: org.maxUsers,
			startedOn: org.startedOn,
			trialEndsOn: org.trialEndsOn,
			paidUntil: org.paidUntil,
			complimentary: org.complimentary ?? false,
			suspendedReason: org.suspendedReason,
			status: (state?.status ?? null) as SubscriptionStatus | null,
			daysLeft: state?.daysLeft ?? null,
			users: usersOf.get(org.id) ?? 0,
			owner: ownerOf.get(org.id)?.name ?? null,
			ownerEmail: ownerOf.get(org.id)?.email ?? null,
			totalPaid: cents(paidOf.get(org.id)?.total ?? 0),
			lastPaidAt: paidOf.get(org.id)?.lastPaidAt ?? null,
			pendingReceipts: waitingOf.get(org.id) ?? 0
		};
	});
}
export type BusinessRow = Awaited<ReturnType<typeof businessRows>>[number];

/** One business, as the list has it; undefined for an unknown id. */
export async function businessRow(orgId: number) {
	return (await businessRows()).find((row) => row.id === orgId);
}

/** The figures on the site admin's first page. */
export async function platformStats(today = localToday()) {
	const since = new Date(Date.now() - 30 * 24 * 60 * 60_000);
	const [rows, [recent], [all], [receipts], [messages]] = await Promise.all([
		businessRows(today),
		db
			.select({ total: sum(subscriptionPayment.amount), payments: count() })
			.from(subscriptionPayment)
			.where(and(eq(subscriptionPayment.status, 'paid'), gte(subscriptionPayment.paidAt, since))),
		db
			.select({ total: sum(subscriptionPayment.amount) })
			.from(subscriptionPayment)
			.where(eq(subscriptionPayment.status, 'paid')),
		db
			.select({ total: count() })
			.from(subscriptionPayment)
			.where(
				and(eq(subscriptionPayment.method, 'bank'), eq(subscriptionPayment.status, 'pending'))
			),
		db.select({ total: count() }).from(contactMessage).where(eq(contactMessage.status, 'new'))
	]);

	const byStatus = { complimentary: 0, trial: 0, active: 0, due: 0, blocked: 0, suspended: 0 };
	for (const row of rows) if (row.status) byStatus[row.status] += 1;

	return {
		businesses: rows.length,
		byStatus,
		newBusinesses: rows.filter((r) => r.createdAt >= since).length,
		paidLast30Days: cents(recent?.total ?? 0),
		paymentsLast30Days: Number(recent?.payments ?? 0),
		paidAllTime: cents(all?.total ?? 0),
		pendingReceipts: Number(receipts?.total ?? 0),
		newMessages: Number(messages?.total ?? 0),
		// What needs someone: late payers first, then trials about to end.
		attention: rows
			.filter(
				(r) =>
					r.status === 'due' ||
					r.status === 'blocked' ||
					(r.status === 'trial' && (r.daysLeft ?? 0) <= 3)
			)
			.slice(0, 8)
	};
}

/** Payments across every business, newest first. Unfinished Chapa checkouts are left out. */
export async function paymentRows(orgId?: number) {
	const rows = await db
		.select({
			id: subscriptionPayment.id,
			orgId: subscriptionPayment.orgId,
			business: organization.name,
			packageName: servicePackage.name,
			amount: subscriptionPayment.amount,
			months: subscriptionPayment.months,
			method: subscriptionPayment.method,
			status: subscriptionPayment.status,
			txRef: subscriptionPayment.txRef,
			bank: platformBankAccount.bankName,
			receiptFile: subscriptionPayment.receiptFile,
			payerReference: subscriptionPayment.payerReference,
			note: subscriptionPayment.note,
			reviewNote: subscriptionPayment.reviewNote,
			periodStart: subscriptionPayment.periodStart,
			periodEnd: subscriptionPayment.periodEnd,
			paidAt: subscriptionPayment.paidAt,
			createdAt: subscriptionPayment.createdAt,
			paidBy: user.name
		})
		.from(subscriptionPayment)
		.innerJoin(organization, eq(organization.id, subscriptionPayment.orgId))
		.innerJoin(servicePackage, eq(servicePackage.id, subscriptionPayment.packageId))
		.leftJoin(platformBankAccount, eq(platformBankAccount.id, subscriptionPayment.bankAccountId))
		.leftJoin(user, eq(user.id, subscriptionPayment.createdBy))
		.where(orgId ? eq(subscriptionPayment.orgId, orgId) : undefined)
		.orderBy(
			// Receipts waiting to be checked come first.
			sql`(${subscriptionPayment.method} = 'bank' AND ${subscriptionPayment.status} = 'pending') DESC`,
			desc(subscriptionPayment.createdAt),
			desc(subscriptionPayment.id)
		);
	return rows.filter((p) => !(p.method === 'chapa' && p.status !== 'paid'));
}
export type AdminPaymentRow = Awaited<ReturnType<typeof paymentRows>>[number];

/** Every package, retired ones included, for choosing one on a form. */
export async function packageChoices() {
	const rows = await db
		.select({
			value: servicePackage.id,
			name: servicePackage.name,
			price: servicePackage.price,
			billingMonths: servicePackage.billingMonths
		})
		.from(servicePackage)
		.where(isNull(servicePackage.deletedAt))
		.orderBy(asc(servicePackage.sortOrder), asc(servicePackage.price));
	return rows;
}

/** Moves a business to another package, a new end date, or onto (or off) a complimentary one. */
export async function changeSubscription(
	orgId: number,
	change: { packageId: number; paidUntil: string; complimentary: boolean }
) {
	await db
		.update(subscription)
		.set({
			packageId: change.packageId,
			paidUntil: change.paidUntil,
			complimentary: change.complimentary
		})
		.where(eq(subscription.orgId, orgId));
}

/** Closes a business whatever it has paid, with the reason its people will be shown. */
export async function suspendBusiness(orgId: number, reason: string) {
	await db
		.update(subscription)
		.set({ suspendedAt: new Date(), suspendedReason: reason })
		.where(eq(subscription.orgId, orgId));
}

export async function resumeBusiness(orgId: number) {
	await db
		.update(subscription)
		.set({ suspendedAt: null, suspendedReason: null })
		.where(eq(subscription.orgId, orgId));
}

/** Messages from the contact page, the unread ones first. */
export async function contactMessages() {
	return db
		.select({
			id: contactMessage.id,
			name: contactMessage.name,
			email: contactMessage.email,
			phone: contactMessage.phone,
			company: contactMessage.company,
			subject: contactMessage.subject,
			message: contactMessage.message,
			locale: contactMessage.locale,
			status: contactMessage.status,
			adminNote: contactMessage.adminNote,
			handledAt: contactMessage.handledAt,
			handledBy: user.name,
			createdAt: contactMessage.createdAt
		})
		.from(contactMessage)
		.leftJoin(user, eq(user.id, contactMessage.handledBy))
		.orderBy(
			sql`${contactMessage.status} = 'new' DESC`,
			desc(contactMessage.createdAt),
			desc(contactMessage.id)
		);
}
export type ContactRow = Awaited<ReturnType<typeof contactMessages>>[number];
