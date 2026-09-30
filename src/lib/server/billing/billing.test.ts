import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { configureKit } from '@nahu/admin-kit/server/db';
import { inRollback, type TestTx } from '@nahu/admin-kit/server/testing/rollback';

import { db } from '$lib/server/db';
import { branch, servicePackage, subscription, subscriptionPayment } from '$lib/server/db/schema';
import { createOrganization } from '$lib/server/seedPermissions';
import { applyPayment, recordManualPayment } from './payments';
import { seatRefusal, startSubscription, subscriptionOf } from './subscriptions';
import { initializeChapaTransaction, verifyChapaTransaction } from './chapa';

beforeAll(() => configureKit({ db }));

const TODAY = '2026-09-30';

/** A business on its own package: monthly, two users, one branch, a 14-day trial. */
async function business(tx: TestTx, pkg: Partial<typeof servicePackage.$inferInsert> = {}) {
	const { orgId } = await createOrganization(tx, { name: 'Billing test shop' });
	const [created] = await tx
		.insert(servicePackage)
		.values({
			name: `Test ${orgId}`,
			slug: `test-${orgId}`,
			price: 1200,
			billingMonths: 1,
			maxUsers: 2,
			maxBranches: 1,
			trialDays: 14,
			...pkg
		})
		.$returningId();
	await startSubscription(tx, orgId, created.id, { today: TODAY });
	return { orgId, packageId: created.id };
}

/** A payment waiting to count, as a bank transfer leaves it. */
async function pendingPayment(tx: TestTx, orgId: number, packageId: number, months = 1) {
	const [row] = await tx
		.insert(subscriptionPayment)
		.values({ orgId, packageId, amount: 1200, months, method: 'bank', status: 'pending' })
		.$returningId();
	return row.id;
}

describe('starting a subscription', () => {
	it('starts on the package with its free trial', async () => {
		const view = await inRollback(async (tx) => {
			const { orgId } = await business(tx);
			return subscriptionOf(orgId, tx, TODAY);
		});

		expect(view).toMatchObject({
			startedOn: TODAY,
			trialEndsOn: '2026-10-14',
			paidUntil: '2026-10-14',
			complimentary: false
		});
		expect(view?.state).toMatchObject({ status: 'trial', allowed: true, daysLeft: 14 });
	});

	it('blocks the business the day after an unpaid trial', async () => {
		const state = await inRollback(async (tx) => {
			const { orgId } = await business(tx);
			return (await subscriptionOf(orgId, tx, '2026-10-15'))?.state;
		});
		expect(state).toMatchObject({ status: 'blocked', allowed: false });
	});
});

describe('applyPayment', () => {
	it('extends from the end of the trial and records the period it bought', async () => {
		const result = await inRollback(async (tx) => {
			const { orgId, packageId } = await business(tx);
			const id = await pendingPayment(tx, orgId, packageId);
			const applied = await applyPayment(tx, id, { today: TODAY });
			const [payment] = await tx
				.select()
				.from(subscriptionPayment)
				.where(eq(subscriptionPayment.id, id));
			return { applied, payment, view: await subscriptionOf(orgId, tx, TODAY) };
		});

		expect(result.applied).toBe(true);
		expect(result.payment).toMatchObject({
			status: 'paid',
			periodStart: '2026-10-15',
			periodEnd: '2026-11-14'
		});
		expect(result.payment.paidAt).toBeInstanceOf(Date);
		expect(result.view?.paidUntil).toBe('2026-11-14');
		expect(result.view?.state.status).toBe('active');
	});

	it('counts a payment once, however often it is confirmed', async () => {
		const result = await inRollback(async (tx) => {
			const { orgId, packageId } = await business(tx);
			const id = await pendingPayment(tx, orgId, packageId);
			const first = await applyPayment(tx, id, { today: TODAY });
			// The webhook and the owner's return to the page both confirm the same payment.
			const second = await applyPayment(tx, id, { today: TODAY });
			return { first, second, view: await subscriptionOf(orgId, tx, TODAY) };
		});

		expect(result.first).toBe(true);
		expect(result.second).toBe(false);
		expect(result.view?.paidUntil).toBe('2026-11-14');
	});

	it('unblocks a lapsed business from today, not from when it lapsed', async () => {
		const view = await inRollback(async (tx) => {
			const { orgId, packageId } = await business(tx);
			const later = '2026-12-01';
			const id = await pendingPayment(tx, orgId, packageId, 3);
			await applyPayment(tx, id, { today: later });
			return subscriptionOf(orgId, tx, later);
		});

		expect(view?.paidUntil).toBe('2027-02-28');
		expect(view?.state).toMatchObject({ status: 'active', allowed: true });
	});

	it('moves the business to the package that was paid for', async () => {
		const view = await inRollback(async (tx) => {
			const { orgId } = await business(tx);
			const [bigger] = await tx
				.insert(servicePackage)
				.values({
					name: `Bigger ${orgId}`,
					slug: `bigger-${orgId}`,
					price: 42000,
					billingMonths: 12
				})
				.$returningId();
			await recordManualPayment(tx, {
				orgId,
				packageId: bigger.id,
				reviewerId: null,
				today: TODAY
			});
			return subscriptionOf(orgId, tx, TODAY);
		});

		expect(view?.package).toMatchObject({ price: 42000, billingMonths: 12, maxUsers: null });
		// A year from the day after the trial ends.
		expect(view?.paidUntil).toBe('2027-10-14');
	});

	it('does not lift a suspension', async () => {
		const state = await inRollback(async (tx) => {
			const { orgId, packageId } = await business(tx);
			await tx
				.update(subscription)
				.set({ suspendedAt: new Date(), suspendedReason: 'test' })
				.where(eq(subscription.orgId, orgId));
			await recordManualPayment(tx, { orgId, packageId, reviewerId: null, today: TODAY });
			return (await subscriptionOf(orgId, tx, TODAY))?.state;
		});
		expect(state).toMatchObject({ status: 'suspended', allowed: false });
	});
});

describe('package limits', () => {
	it('refuses a branch past the limit, and allows one within it', async () => {
		const result = await inRollback(async (tx) => {
			// `createOrganization` makes the main branch: one of one is in use.
			const { orgId, packageId } = await business(tx);
			const full = await seatRefusal(orgId, 'branch', 1, tx);

			await tx
				.update(servicePackage)
				.set({ maxBranches: 2 })
				.where(eq(servicePackage.id, packageId));
			const roomForOne = await seatRefusal(orgId, 'branch', 1, tx);
			await tx.insert(branch).values({ orgId, name: 'Second', code: 'SEC' });
			const fullAgain = await seatRefusal(orgId, 'branch', 1, tx);

			await tx
				.update(servicePackage)
				.set({ maxBranches: null })
				.where(eq(servicePackage.id, packageId));
			const unlimited = await seatRefusal(orgId, 'branch', 1, tx);
			return { full, roomForOne, fullAgain, unlimited };
		});

		expect(result.full).toContain('1');
		expect(result.roomForOne).toBeNull();
		expect(result.fullAgain).not.toBeNull();
		expect(result.unlimited).toBeNull();
	});

	it('counts no user against a business that has none', async () => {
		const refusal = await inRollback(async (tx) => {
			const { orgId } = await business(tx);
			return seatRefusal(orgId, 'user', 1, tx);
		});
		expect(refusal).toBeNull();
	});
});

describe('Chapa', () => {
	afterEach(() => vi.unstubAllGlobals());

	const reply = (status: number, body: unknown) =>
		new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

	const params = {
		amount: 1200,
		email: 'owner@shop.example.com',
		name: 'Abebe Kebede',
		phone: '+251 911 22 33 44',
		txRef: 'sm1-abc',
		callbackUrl: 'http://localhost/api/chapa/callback',
		returnUrl: 'http://localhost/dashboard/subscription?ref=sm1-abc'
	};

	it('sends what Chapa expects and returns the checkout URL', async () => {
		const fetchMock = vi.fn(async () =>
			reply(200, { status: 'success', data: { checkout_url: 'https://checkout.chapa.co/x' } })
		);
		vi.stubGlobal('fetch', fetchMock);

		expect(await initializeChapaTransaction(params)).toBe('https://checkout.chapa.co/x');
		const sent = JSON.parse(
			(fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string
		);
		expect(sent).toMatchObject({
			amount: '1200.00',
			currency: 'ETB',
			email: 'owner@shop.example.com',
			first_name: 'Abebe',
			last_name: 'Kebede',
			phone_number: '0911223344',
			tx_ref: 'sm1-abc'
		});
	});

	it('starts the checkout without the email when Chapa refuses the address', async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(
				reply(400, { status: 'failed', message: { email: ['validation.email'] } })
			)
			.mockResolvedValueOnce(
				reply(200, { status: 'success', data: { checkout_url: 'https://checkout.chapa.co/y' } })
			);
		vi.stubGlobal('fetch', fetchMock);

		expect(await initializeChapaTransaction(params)).toBe('https://checkout.chapa.co/y');
		expect(fetchMock).toHaveBeenCalledTimes(2);
		expect(JSON.parse(fetchMock.mock.calls[1][1].body).email).toBeUndefined();
	});

	it('reports any other refusal', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => reply(400, { status: 'failed', message: 'Invalid API Key' }))
		);
		await expect(initializeChapaTransaction(params)).rejects.toThrow('Invalid API Key');
	});

	it('reads paid, failed and not-yet from a verification', async () => {
		const verify = async (status: number, body: unknown) => {
			vi.stubGlobal(
				'fetch',
				vi.fn(async () => reply(status, body))
			);
			return verifyChapaTransaction('sm1-abc');
		};

		expect(
			await verify(200, {
				status: 'success',
				data: { status: 'success', amount: '1200', currency: 'ETB', tx_ref: 'sm1-abc' }
			})
		).toEqual({ paid: true, failed: false, amount: 1200, currency: 'ETB', txRef: 'sm1-abc' });

		expect(await verify(200, { status: 'success', data: { status: 'failed' } })).toMatchObject({
			paid: false,
			failed: true
		});
		// An unknown or abandoned reference: nothing paid yet, and not a failure either.
		expect(await verify(400, { status: 'failed', message: 'Invalid transaction' })).toMatchObject({
			paid: false,
			failed: false
		});
		await expect(verify(502, {})).rejects.toThrow('HTTP 502');
	});
});
