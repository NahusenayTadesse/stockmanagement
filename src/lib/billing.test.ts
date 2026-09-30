import { describe, expect, it } from 'vitest';
import {
	GRACE_DAYS,
	RENEWAL_NOTICE_DAYS,
	addDays,
	addMonths,
	daysBetween,
	monthlyPrice,
	nextPeriod,
	subscriptionState
} from './billing';

describe('days and months', () => {
	it('moves a day across a month and a year', () => {
		expect(addDays('2026-09-30', 1)).toBe('2026-10-01');
		expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
		expect(daysBetween('2026-09-30', '2026-10-14')).toBe(14);
		expect(daysBetween('2026-10-14', '2026-09-30')).toBe(-14);
	});

	it('keeps to the end of a shorter month', () => {
		expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
		expect(addMonths('2028-01-31', 1)).toBe('2028-02-29');
		expect(addMonths('2026-08-31', 3)).toBe('2026-11-30');
		expect(addMonths('2026-11-15', 12)).toBe('2027-11-15');
		expect(addMonths('2026-03-31', -1)).toBe('2026-02-28');
	});

	it('works out what a month of a longer package costs', () => {
		expect(monthlyPrice(6900, 3)).toBe(2300);
		expect(monthlyPrice(1000, 3)).toBe(333.33);
	});
});

describe('nextPeriod', () => {
	it('extends a running subscription from the day after it ends', () => {
		expect(nextPeriod('2026-10-14', '2026-09-30', 1)).toEqual({
			start: '2026-10-15',
			end: '2026-11-14'
		});
	});

	it('extends from today when the last covered day is today', () => {
		expect(nextPeriod('2026-09-30', '2026-09-30', 3)).toEqual({
			start: '2026-10-01',
			end: '2026-12-31'
		});
	});

	it('starts again today when the subscription has lapsed', () => {
		// Nothing is charged for the days the business could not work.
		expect(nextPeriod('2026-08-01', '2026-09-30', 12)).toEqual({
			start: '2026-09-30',
			end: '2027-09-29'
		});
	});
});

describe('subscriptionState', () => {
	const today = '2026-09-30';
	const paid = { trialEndsOn: '2026-06-01', complimentary: false, suspendedAt: null };
	const trial = (paidUntil: string) => ({
		paidUntil,
		trialEndsOn: paidUntil,
		complimentary: false,
		suspendedAt: null
	});

	it('is a trial until the trial ends, then blocked at once', () => {
		expect(subscriptionState(trial('2026-10-14'), today)).toMatchObject({
			status: 'trial',
			allowed: true,
			daysLeft: 14,
			paymentDue: false
		});
		// The last day of the trial is still a working day.
		expect(subscriptionState(trial(today), today)).toMatchObject({
			status: 'trial',
			allowed: true,
			daysLeft: 0,
			paymentDue: true
		});
		// A trial has no grace: grace is for a customer whose payment is late.
		expect(subscriptionState(trial('2026-09-29'), today)).toMatchObject({
			status: 'blocked',
			allowed: false,
			paymentDue: true
		});
	});

	it('is active while paid, and asks for payment as the end nears', () => {
		expect(subscriptionState({ ...paid, paidUntil: '2026-12-19' }, today)).toMatchObject({
			status: 'active',
			allowed: true,
			paymentDue: false
		});
		expect(
			subscriptionState({ ...paid, paidUntil: addDays(today, RENEWAL_NOTICE_DAYS) }, today)
		).toMatchObject({ status: 'active', paymentDue: true });
		expect(
			subscriptionState({ ...paid, paidUntil: addDays(today, RENEWAL_NOTICE_DAYS + 1) }, today)
		).toMatchObject({ status: 'active', paymentDue: false });
	});

	it('keeps a late payer working through the grace days, then blocks', () => {
		const lastGraceDay = { ...paid, paidUntil: addDays(today, -GRACE_DAYS) };
		expect(subscriptionState(lastGraceDay, today)).toMatchObject({
			status: 'due',
			allowed: true,
			paymentDue: true,
			graceEndsOn: today
		});
		expect(
			subscriptionState({ ...paid, paidUntil: addDays(today, -GRACE_DAYS - 1) }, today)
		).toMatchObject({ status: 'blocked', allowed: false, graceEndsOn: null });
	});

	it('never runs out when complimentary', () => {
		expect(
			subscriptionState(
				{ paidUntil: '2020-01-01', trialEndsOn: null, complimentary: true, suspendedAt: null },
				today
			)
		).toMatchObject({ status: 'complimentary', allowed: true, paymentDue: false });
	});

	it('is closed by a suspension whatever was paid', () => {
		expect(
			subscriptionState({ ...paid, paidUntil: '2027-01-01', suspendedAt: new Date() }, today)
		).toMatchObject({ status: 'suspended', allowed: false });
		expect(
			subscriptionState(
				{
					paidUntil: '2027-01-01',
					trialEndsOn: null,
					complimentary: true,
					suspendedAt: new Date()
				},
				today
			)
		).toMatchObject({ status: 'suspended', allowed: false });
	});
});
