/**
 * Subscriptions, worked out: whether a business may use the system today, what a payment buys,
 * and how a package's price reads. Pure and client-safe — the server (`$lib/server/billing`)
 * and the pages use the same functions, so the gate and what the owner is shown cannot disagree.
 */
import { m } from '$lib/paraglide/messages.js';
import { labels } from '$lib/format';

/** Days a paid subscription keeps working after its last covered day, while the payment is late. */
export const GRACE_DAYS = 7;
/** Days before the end of a period from which the owner is reminded to pay. */
export const RENEWAL_NOTICE_DAYS = 7;

/**
 * - `complimentary`: never runs out.
 * - `trial`: inside the free trial.
 * - `active`: paid, and inside the period paid for.
 * - `due`: the period has ended and the payment is late, but the grace days are not over.
 * - `blocked`: the trial ended unpaid, or the grace days ran out.
 * - `suspended`: closed by the site admin, whatever was paid.
 */
export type SubscriptionStatus =
	'complimentary' | 'trial' | 'active' | 'due' | 'blocked' | 'suspended';

/** What decides a subscription's state: the columns of `subscription` that matter. */
export type SubscriptionFacts = {
	paidUntil: string;
	trialEndsOn: string | null;
	complimentary: boolean;
	suspendedAt: Date | string | null;
};

export type SubscriptionState = {
	status: SubscriptionStatus;
	/** Whether the business may use the application today. */
	allowed: boolean;
	/** Days left in the period, today included; negative once it has ended. */
	daysLeft: number;
	/** A payment is wanted now: the period ends within the notice days, or has ended. */
	paymentDue: boolean;
	/** For `due`: the last day the business can still work without paying. */
	graceEndsOn: string | null;
};

const utc = (day: string) => {
	const [y, mo, d] = day.split('-').map(Number);
	return Date.UTC(y, mo - 1, d);
};
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** A `YYYY-MM-DD` day moved by whole days. */
export function addDays(day: string, days: number): string {
	return iso(utc(day) + days * 86_400_000);
}

/** Whole days from `from` to `to`; negative when `to` is earlier. */
export function daysBetween(from: string, to: string): number {
	return Math.round((utc(to) - utc(from)) / 86_400_000);
}

/**
 * A day moved by whole months, kept to the end of the month when the day does not exist there:
 * 31 January plus one month is 28 (or 29) February.
 */
export function addMonths(day: string, months: number): string {
	const [y, mo, d] = day.split('-').map(Number);
	const first = new Date(Date.UTC(y, mo - 1 + months, 1));
	const lastDay = new Date(
		Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)
	).getUTCDate();
	return iso(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), Math.min(d, lastDay)));
}

/** A subscription's state on `today` (a `YYYY-MM-DD` day in Addis Ababa). */
export function subscriptionState(facts: SubscriptionFacts, today: string): SubscriptionState {
	const daysLeft = daysBetween(today, facts.paidUntil);

	if (facts.suspendedAt) {
		return { status: 'suspended', allowed: false, daysLeft, paymentDue: false, graceEndsOn: null };
	}
	if (facts.complimentary) {
		return {
			status: 'complimentary',
			allowed: true,
			daysLeft,
			paymentDue: false,
			graceEndsOn: null
		};
	}

	// Still on the trial: nothing paid has moved the end past it.
	const onTrial = facts.trialEndsOn !== null && facts.paidUntil <= facts.trialEndsOn;

	if (daysLeft >= 0) {
		return {
			status: onTrial ? 'trial' : 'active',
			allowed: true,
			daysLeft,
			paymentDue: daysLeft <= RENEWAL_NOTICE_DAYS,
			graceEndsOn: null
		};
	}

	// A trial that ran out has no grace: grace is for a customer whose payment is late.
	const graceEndsOn = addDays(facts.paidUntil, GRACE_DAYS);
	if (!onTrial && today <= graceEndsOn) {
		return { status: 'due', allowed: true, daysLeft, paymentDue: true, graceEndsOn };
	}
	return { status: 'blocked', allowed: false, daysLeft, paymentDue: true, graceEndsOn: null };
}

/**
 * The days a payment for `months` covers. A subscription that has not run out is extended from
 * the day after it ends, so paying early loses nothing; one that has starts again today.
 */
export function nextPeriod(
	paidUntil: string,
	today: string,
	months: number
): { start: string; end: string } {
	const start = paidUntil >= today ? addDays(paidUntil, 1) : today;
	return { start, end: addDays(addMonths(start, months), -1) };
}

/** What one month of a package comes to, for comparing packages paid at different intervals. */
export function monthlyPrice(price: number, billingMonths: number): number {
	return Math.round((price / billingMonths) * 100) / 100;
}

/** "month", "3 months", "year": what one payment of a package covers. */
export function periodText(billingMonths: number): string {
	if (billingMonths === 1) return m.billing_period_month();
	if (billingMonths === 12) return m.billing_period_year();
	return m.billing_period_months({ count: billingMonths });
}

/** "Every month", "Every 3 months", "Once a year": how often a package is paid. */
export function frequencyText(billingMonths: number): string {
	if (billingMonths === 1) return m.billing_frequency_month();
	if (billingMonths === 12) return m.billing_frequency_year();
	return m.billing_frequency_months({ count: billingMonths });
}

/** "Up to 3 users" / "Unlimited users". */
export const usersText = (maxUsers: number | null) =>
	maxUsers === null ? m.billing_users_unlimited() : m.billing_users_up_to({ count: maxUsers });

/** "1 branch" / "Up to 3 branches" / "Unlimited branches". */
export const branchesText = (maxBranches: number | null) =>
	maxBranches === null
		? m.billing_branches_unlimited()
		: maxBranches === 1
			? m.billing_branches_one()
			: m.billing_branches_up_to({ count: maxBranches });

export const SUBSCRIPTION_STATUS_LABELS = labels<SubscriptionStatus>({
	complimentary: m.billing_status_complimentary,
	trial: m.billing_status_trial,
	active: m.billing_status_active,
	due: m.billing_status_due,
	blocked: m.billing_status_blocked,
	suspended: m.billing_status_suspended
});

/** Which badge colour a subscription status takes (the kit's badge knows these words). */
export const SUBSCRIPTION_STATUS_BADGE: Record<SubscriptionStatus, string> = {
	complimentary: 'active',
	trial: 'new',
	active: 'active',
	due: 'pending',
	blocked: 'overdue',
	suspended: 'cancelled'
};

export const PAYMENT_STATUS_LABELS: Record<string, string> = labels({
	pending: m.billing_pay_status_pending,
	paid: m.billing_pay_status_paid,
	failed: m.billing_pay_status_failed,
	rejected: m.billing_pay_status_rejected,
	cancelled: m.billing_pay_status_cancelled
});

export const PAYMENT_STATUS_BADGE: Record<string, string> = {
	pending: 'pending',
	paid: 'paid',
	failed: 'failed',
	rejected: 'rejected',
	cancelled: 'closed'
};

export const PAYMENT_METHOD_LABELS: Record<string, string> = labels({
	chapa: m.billing_method_chapa,
	bank: m.billing_method_bank,
	manual: m.billing_method_manual
});

const WHOLE = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });

/** A price as a price list writes it: "ETB 1,200", with cents only when there are any. */
export const priceText = (amount: number) => `ETB ${WHOLE.format(amount)}`;
