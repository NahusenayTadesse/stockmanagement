/**
 * Paying for a subscription: online through Chapa, by bank transfer with a receipt, or recorded
 * by a site admin.
 *
 * A subscription is extended in exactly one place: `applyPayment()`. Every way a payment can be
 * confirmed — Chapa's webhook, its callback, the owner landing back on the Subscription page, a
 * site admin confirming a receipt — ends there, so that:
 *
 *   1. For Chapa, Chapa is asked server to server whether the payment succeeded, and the answer
 *      is held to what was expected: our reference, ETB, and at least the amount asked for.
 *   2. It counts exactly once. The callers race on a conditional UPDATE of the payment's status;
 *      only the winner extends the subscription and sends the confirmation email.
 *
 * Seed-safe, like `subscriptions.ts`.
 */
import { and, asc, desc, eq, gte, isNull, ne } from 'drizzle-orm';
import { localToday } from '@nahu/admin-kit/time';
import { db } from '$lib/server/db';
import {
	organization,
	platformBankAccount,
	roles,
	servicePackage,
	subscription,
	subscriptionPayment,
	user
} from '$lib/server/db/schema';
import { nextPeriod } from '$lib/billing';
import { amountText } from '$lib/money';
import { sendMail } from '$lib/server/mail';
import { m } from '$lib/paraglide/messages.js';
import type { Tx } from '$lib/server/stock/ledger';
import { initializeChapaTransaction, newTxRef, verifyChapaTransaction } from './chapa';
import { packageOnSale } from './subscriptions';

type Reader = Pick<typeof db, 'select'>;

/*
 * Rows are stamped `createdAt: new Date()` here rather than left to the column's default: the
 * driver writes and reads dates as UTC, while `DEFAULT now()` is the database server's local
 * time, and on a server not set to UTC the two differ by its offset.
 */

/** Money comparisons get a cent of slack for decimal round-tripping. */
const AMOUNT_TOLERANCE = 0.01;

/**
 * Chapa could not start the checkout (down, rate-limited, rejected the details). The attempt is
 * already recorded by then; the owner can try again or pay by bank transfer instead.
 */
export class PaymentStartError extends Error {
	constructor(cause: unknown) {
		super(cause instanceof Error ? cause.message : 'Could not start the payment', { cause });
	}
}

/** A payment turned down for a reason the person can act on: the package is gone, already paid. */
export class PaymentRefused extends Error {}

/** Row count from a drizzle/mysql2 write, which resolves to `[ResultSetHeader, …]`. */
function affectedRowsOf(result: unknown): number {
	const header = Array.isArray(result) ? result[0] : result;
	return (header as { affectedRows?: number } | undefined)?.affectedRows ?? 0;
}

/**
 * Marks a payment paid and extends its business's subscription by what it bought. Returns false,
 * changing nothing, when the payment was already paid — the caller lost the race, or is a retry.
 *
 * The claim is the conditional UPDATE: of two callers confirming the same payment, exactly one
 * changes a row. The subscription moves to the package that was paid for.
 */
export async function applyPayment(
	tx: Tx,
	paymentId: number,
	options: { today?: string; reviewerId?: string | null } = {}
): Promise<boolean> {
	const today = options.today ?? localToday();
	const now = new Date();

	const claim = await tx
		.update(subscriptionPayment)
		.set({
			status: 'paid',
			paidAt: now,
			...(options.reviewerId ? { reviewedBy: options.reviewerId, reviewedAt: now } : {})
		})
		.where(and(eq(subscriptionPayment.id, paymentId), ne(subscriptionPayment.status, 'paid')));
	if (affectedRowsOf(claim) === 0) return false;

	const [payment] = await tx
		.select({
			orgId: subscriptionPayment.orgId,
			packageId: subscriptionPayment.packageId,
			months: subscriptionPayment.months
		})
		.from(subscriptionPayment)
		.where(eq(subscriptionPayment.id, paymentId));

	// Locked, so two payments for one business extend it one after the other, never both from
	// the same end date.
	const [current] = await tx
		.select({ id: subscription.id, paidUntil: subscription.paidUntil })
		.from(subscription)
		.where(eq(subscription.orgId, payment.orgId))
		.for('update');

	const period = nextPeriod(current?.paidUntil ?? today, today, payment.months);
	if (current) {
		await tx
			.update(subscription)
			.set({ packageId: payment.packageId, paidUntil: period.end })
			.where(eq(subscription.id, current.id));
	} else {
		await tx.insert(subscription).values({
			orgId: payment.orgId,
			packageId: payment.packageId,
			startedOn: today,
			paidUntil: period.end
		});
	}

	await tx
		.update(subscriptionPayment)
		.set({ periodStart: period.start, periodEnd: period.end })
		.where(eq(subscriptionPayment.id, paymentId));
	return true;
}

/** Who to write to about a payment: whoever made it, else the business's first active owner. */
async function payerOf(paymentId: number) {
	const [row] = await db
		.select({
			orgId: subscriptionPayment.orgId,
			amount: subscriptionPayment.amount,
			periodEnd: subscriptionPayment.periodEnd,
			reviewNote: subscriptionPayment.reviewNote,
			packageName: servicePackage.name,
			business: organization.name,
			name: user.name,
			email: user.email
		})
		.from(subscriptionPayment)
		.innerJoin(organization, eq(organization.id, subscriptionPayment.orgId))
		.innerJoin(servicePackage, eq(servicePackage.id, subscriptionPayment.packageId))
		.leftJoin(user, eq(user.id, subscriptionPayment.createdBy))
		.where(eq(subscriptionPayment.id, paymentId));
	if (!row) return null;
	if (row.email) return row;

	const [owner] = await db
		.select({ name: user.name, email: user.email })
		.from(user)
		.innerJoin(roles, eq(roles.id, user.roleId))
		.where(
			and(
				eq(user.orgId, row.orgId),
				eq(roles.isOwner, true),
				eq(user.isActive, true),
				isNull(user.deletedAt)
			)
		)
		.orderBy(asc(user.createdAt))
		.limit(1);
	return { ...row, name: owner?.name ?? null, email: owner?.email ?? null };
}

/** Tells the payer their payment counted. Never throws: the payment is already recorded. */
async function mailPaymentReceived(paymentId: number) {
	const payer = await payerOf(paymentId);
	if (!payer?.email) return;
	await sendMail(payer.email, {
		subject: m.billing_mail_paid_subject(),
		body: [
			m.admin_mail_hello({ name: payer.name ?? payer.business }),
			m.billing_mail_paid_body({
				amount: amountText(payer.amount),
				package: payer.packageName,
				business: payer.business,
				until: payer.periodEnd ?? ''
			})
		]
	});
}

async function mailPaymentRejected(paymentId: number) {
	const payer = await payerOf(paymentId);
	if (!payer?.email) return;
	await sendMail(payer.email, {
		subject: m.billing_mail_rejected_subject(),
		body: [
			m.admin_mail_hello({ name: payer.name ?? payer.business }),
			m.billing_mail_rejected_body({
				amount: amountText(payer.amount),
				business: payer.business
			}),
			payer.reviewNote ? m.billing_mail_rejected_reason({ reason: payer.reviewNote }) : ''
		]
	});
}

// ── Chapa ────────────────────────────────────────────────────────────────────────────────────

/**
 * Starts an online payment for a package and returns Chapa's checkout URL. Each call is a new
 * attempt with a new reference, recorded before the payer leaves for Chapa so a webhook that
 * beats them back can already be matched.
 */
export async function startOnlinePayment(input: {
	orgId: number;
	packageId: number;
	payer: { id: string; name: string; email: string };
	origin: string;
}): Promise<string> {
	const pkg = await packageOnSale(input.packageId);
	if (!pkg) throw new PaymentRefused(m.billing_package_gone());

	const [org] = await db
		.select({ phone: organization.phone })
		.from(organization)
		.where(eq(organization.id, input.orgId));

	const txRef = newTxRef(input.orgId);
	await db.insert(subscriptionPayment).values({
		orgId: input.orgId,
		packageId: pkg.id,
		amount: pkg.price,
		months: pkg.billingMonths,
		method: 'chapa',
		status: 'pending',
		txRef,
		createdBy: input.payer.id,
		createdAt: new Date()
	});

	try {
		return await initializeChapaTransaction({
			amount: pkg.price,
			email: input.payer.email,
			name: input.payer.name,
			phone: org?.phone,
			txRef,
			callbackUrl: `${input.origin}/api/chapa/callback`,
			returnUrl: `${input.origin}/dashboard/subscription?ref=${encodeURIComponent(txRef)}`,
			title: 'Stock package',
			description: `${pkg.name} package subscription`
		});
	} catch (err) {
		// Nothing was paid on a checkout that never opened; the attempt is closed, not left
		// looking like a payment on its way.
		await db
			.update(subscriptionPayment)
			.set({ status: 'failed', note: 'Chapa did not start the checkout' })
			.where(and(eq(subscriptionPayment.txRef, txRef), eq(subscriptionPayment.status, 'pending')));
		throw new PaymentStartError(err);
	}
}

export type SettlementOutcome =
	| { status: 'paid'; orgId: number; amount: number; alreadySettled: boolean }
	| { status: 'failed'; orgId: number; reason: string }
	// `retryable`: asking again later could change the answer (Chapa unreachable, or the payer
	// has not finished). The webhook answers those with a 5xx so Chapa retries; anything else is
	// acknowledged and logged.
	| { status: 'pending'; orgId: number | null; reason: string; retryable: boolean };

/**
 * Confirms a payment with Chapa and, if it genuinely went through, extends the subscription.
 * Safe to call repeatedly and concurrently for the same reference.
 */
export async function settleOnlinePayment(txRef: string): Promise<SettlementOutcome> {
	const [payment] = await db
		.select({
			id: subscriptionPayment.id,
			orgId: subscriptionPayment.orgId,
			amount: subscriptionPayment.amount,
			status: subscriptionPayment.status
		})
		.from(subscriptionPayment)
		.where(and(eq(subscriptionPayment.txRef, txRef), eq(subscriptionPayment.method, 'chapa')));

	if (!payment) {
		return {
			status: 'pending',
			orgId: null,
			reason: m.billing_settle_unknown(),
			retryable: false
		};
	}

	const { orgId } = payment;
	if (payment.status === 'paid') {
		return { status: 'paid', orgId, amount: payment.amount, alreadySettled: true };
	}

	let verification;
	try {
		verification = await verifyChapaTransaction(txRef);
	} catch (err) {
		console.error(`Chapa verify failed for ${txRef}:`, err);
		return { status: 'pending', orgId, reason: m.billing_settle_unreachable(), retryable: true };
	}

	if (!verification.paid) {
		if (verification.failed) {
			await db
				.update(subscriptionPayment)
				.set({ status: 'failed' })
				.where(
					and(eq(subscriptionPayment.id, payment.id), eq(subscriptionPayment.status, 'pending'))
				);
			return { status: 'failed', orgId, reason: m.billing_settle_failed() };
		}
		return { status: 'pending', orgId, reason: m.billing_settle_not_yet(), retryable: true };
	}

	if (verification.txRef && verification.txRef !== txRef) {
		console.error(`Chapa tx_ref mismatch: expected ${txRef}, got ${verification.txRef}`);
		return { status: 'pending', orgId, reason: m.billing_settle_mismatch(), retryable: false };
	}
	if (verification.currency && verification.currency !== 'ETB') {
		console.error(`Chapa currency mismatch on ${txRef}: ${verification.currency}`);
		return { status: 'pending', orgId, reason: m.billing_settle_mismatch(), retryable: false };
	}
	if (
		!Number.isFinite(verification.amount) ||
		verification.amount + AMOUNT_TOLERANCE < payment.amount
	) {
		console.error(
			`Chapa amount short on ${txRef}: expected ${payment.amount}, got ${verification.amount}`
		);
		return { status: 'pending', orgId, reason: m.billing_settle_short(), retryable: false };
	}

	// An attempt the owner gave up on (cancelled) or that Chapa first called failed still counts
	// once Chapa says the money arrived.
	const applied = await db.transaction((tx) => applyPayment(tx, payment.id));
	if (applied) {
		mailPaymentReceived(payment.id).catch((err) => console.error('[billing] mail failed:', err));
	}
	return { status: 'paid', orgId, amount: payment.amount, alreadySettled: !applied };
}

/** The business a Chapa reference belongs to and what became of it, or undefined. */
export async function attemptByTxRef(txRef: string) {
	const [row] = await db
		.select({ orgId: subscriptionPayment.orgId, status: subscriptionPayment.status })
		.from(subscriptionPayment)
		.where(eq(subscriptionPayment.txRef, txRef));
	return row;
}

// ── Bank transfer ────────────────────────────────────────────────────────────────────────────

/** The accounts a business may transfer to. */
export async function bankAccounts(reader: Reader = db) {
	return reader
		.select({
			id: platformBankAccount.id,
			bankName: platformBankAccount.bankName,
			accountName: platformBankAccount.accountName,
			accountNumber: platformBankAccount.accountNumber
		})
		.from(platformBankAccount)
		.where(and(eq(platformBankAccount.isActive, true), isNull(platformBankAccount.deletedAt)))
		.orderBy(asc(platformBankAccount.sortOrder), asc(platformBankAccount.id));
}

/**
 * Records a bank transfer with its receipt. It stays `pending`: the money counts only when a site
 * admin has checked the receipt. A receipt sent earlier and still waiting is replaced by this one.
 */
export async function recordBankTransfer(input: {
	orgId: number;
	packageId: number;
	bankAccountId: number;
	receiptFile: string;
	payerReference?: string | null;
	userId: string;
}): Promise<number> {
	const pkg = await packageOnSale(input.packageId);
	if (!pkg) throw new PaymentRefused(m.billing_package_gone());

	const accounts = await bankAccounts();
	if (!accounts.some((a) => a.id === input.bankAccountId)) {
		throw new PaymentRefused(m.billing_choose_account());
	}

	return db.transaction(async (tx) => {
		await tx
			.update(subscriptionPayment)
			.set({ status: 'cancelled' })
			.where(
				and(
					eq(subscriptionPayment.orgId, input.orgId),
					eq(subscriptionPayment.method, 'bank'),
					eq(subscriptionPayment.status, 'pending')
				)
			);
		const [row] = await tx
			.insert(subscriptionPayment)
			.values({
				orgId: input.orgId,
				packageId: pkg.id,
				amount: pkg.price,
				months: pkg.billingMonths,
				method: 'bank',
				status: 'pending',
				bankAccountId: input.bankAccountId,
				receiptFile: input.receiptFile,
				payerReference: input.payerReference || null,
				createdBy: input.userId,
				createdAt: new Date()
			})
			.$returningId();
		return row.id;
	});
}

/** A site admin checked the receipt against the bank statement: the transfer counts. */
export async function confirmBankPayment(paymentId: number, reviewerId: string) {
	const applied = await db.transaction(async (tx) => {
		const [payment] = await tx
			.select({ status: subscriptionPayment.status, method: subscriptionPayment.method })
			.from(subscriptionPayment)
			.where(eq(subscriptionPayment.id, paymentId))
			.for('update');
		if (!payment || payment.method === 'chapa' || payment.status !== 'pending') return false;
		return applyPayment(tx, paymentId, { reviewerId });
	});
	if (applied) {
		mailPaymentReceived(paymentId).catch((err) => console.error('[billing] mail failed:', err));
	}
	return applied;
}

/** A site admin could not match the receipt to money received. The business sees the reason. */
export async function rejectBankPayment(paymentId: number, reviewerId: string, note: string) {
	const result = await db
		.update(subscriptionPayment)
		.set({
			status: 'rejected',
			reviewNote: note,
			reviewedBy: reviewerId,
			reviewedAt: new Date()
		})
		.where(
			and(
				eq(subscriptionPayment.id, paymentId),
				eq(subscriptionPayment.method, 'bank'),
				eq(subscriptionPayment.status, 'pending')
			)
		);
	const rejected = affectedRowsOf(result) > 0;
	if (rejected) {
		mailPaymentRejected(paymentId).catch((err) => console.error('[billing] mail failed:', err));
	}
	return rejected;
}

/**
 * A payment a site admin took by hand — cash at the office, a cheque, a courtesy month — recorded
 * and counted at once. The amount may differ from the package's price (a discount); the months
 * are the package's.
 */
export async function recordManualPayment(
	tx: Tx,
	input: {
		orgId: number;
		packageId: number;
		amount?: number;
		note?: string | null;
		reviewerId: string | null;
		today?: string;
	}
): Promise<number> {
	const [pkg] = await tx
		.select({ price: servicePackage.price, billingMonths: servicePackage.billingMonths })
		.from(servicePackage)
		.where(eq(servicePackage.id, input.packageId));
	if (!pkg) throw new PaymentRefused(m.billing_package_gone());

	const [row] = await tx
		.insert(subscriptionPayment)
		.values({
			orgId: input.orgId,
			packageId: input.packageId,
			amount: input.amount ?? pkg.price,
			months: pkg.billingMonths,
			method: 'manual',
			status: 'pending',
			note: input.note || null,
			createdBy: input.reviewerId,
			createdAt: new Date()
		})
		.$returningId();
	await applyPayment(tx, row.id, { reviewerId: input.reviewerId, today: input.today });
	return row.id;
}

// ── Reading ──────────────────────────────────────────────────────────────────────────────────

const paymentColumns = {
	id: subscriptionPayment.id,
	amount: subscriptionPayment.amount,
	months: subscriptionPayment.months,
	method: subscriptionPayment.method,
	status: subscriptionPayment.status,
	txRef: subscriptionPayment.txRef,
	receiptFile: subscriptionPayment.receiptFile,
	payerReference: subscriptionPayment.payerReference,
	note: subscriptionPayment.note,
	periodStart: subscriptionPayment.periodStart,
	periodEnd: subscriptionPayment.periodEnd,
	paidAt: subscriptionPayment.paidAt,
	reviewNote: subscriptionPayment.reviewNote,
	createdAt: subscriptionPayment.createdAt,
	packageName: servicePackage.name
};

/**
 * A business's payments, newest first. Chapa attempts that were started and never finished are
 * left out: they are not payments, and an owner who opened the checkout three times should not
 * see three lines.
 */
export async function paymentsOf(orgId: number, reader: Reader = db) {
	const rows = await reader
		.select(paymentColumns)
		.from(subscriptionPayment)
		.innerJoin(servicePackage, eq(servicePackage.id, subscriptionPayment.packageId))
		.where(eq(subscriptionPayment.orgId, orgId))
		.orderBy(desc(subscriptionPayment.createdAt), desc(subscriptionPayment.id));
	return rows.filter((p) => !(p.method === 'chapa' && p.status !== 'paid'));
}
export type PaymentRow = Awaited<ReturnType<typeof paymentsOf>>[number];

/** The payment that last counted, for "last payment" on the owner's page. */
export async function lastPaidPayment(orgId: number, reader: Reader = db) {
	const [row] = await reader
		.select(paymentColumns)
		.from(subscriptionPayment)
		.innerJoin(servicePackage, eq(servicePackage.id, subscriptionPayment.packageId))
		.where(and(eq(subscriptionPayment.orgId, orgId), eq(subscriptionPayment.status, 'paid')))
		.orderBy(desc(subscriptionPayment.paidAt), desc(subscriptionPayment.id))
		.limit(1);
	return row ?? null;
}

/** Whether `fileName` is a receipt this business uploaded — for the file route. */
export async function ownsReceipt(orgId: number, fileName: string, reader: Reader = db) {
	const [row] = await reader
		.select({ id: subscriptionPayment.id })
		.from(subscriptionPayment)
		.where(
			and(eq(subscriptionPayment.orgId, orgId), eq(subscriptionPayment.receiptFile, fileName))
		);
	return Boolean(row);
}

/** Whether `fileName` is any business's receipt — for the site admin's file route. */
export async function isReceipt(fileName: string, reader: Reader = db) {
	const [row] = await reader
		.select({ id: subscriptionPayment.id })
		.from(subscriptionPayment)
		.where(eq(subscriptionPayment.receiptFile, fileName));
	return Boolean(row);
}

/**
 * The business's latest Chapa checkout that was opened in the last day and never confirmed, so
 * the owner's page can offer to check it again — they may have paid and closed the tab before
 * Chapa sent them back.
 */
export async function latestOpenChapaAttempt(orgId: number) {
	const since = new Date(Date.now() - 24 * 60 * 60_000);
	const [row] = await db
		.select({ txRef: subscriptionPayment.txRef, createdAt: subscriptionPayment.createdAt })
		.from(subscriptionPayment)
		.where(
			and(
				eq(subscriptionPayment.orgId, orgId),
				eq(subscriptionPayment.method, 'chapa'),
				eq(subscriptionPayment.status, 'pending'),
				gte(subscriptionPayment.createdAt, since)
			)
		)
		.orderBy(desc(subscriptionPayment.createdAt))
		.limit(1);
	return row?.txRef ? { txRef: row.txRef, createdAt: row.createdAt } : null;
}
