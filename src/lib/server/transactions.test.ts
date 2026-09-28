import { beforeAll, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { configureKit } from '@nahu/admin-kit/server/db';
import { inRollback, type TestTx } from '@nahu/admin-kit/server/testing/rollback';
import { WriteRefused } from '@nahu/admin-kit/server/childCrud';

import { db } from '$lib/server/db';
import { paymentMethod, transactionAttachment, transactions } from '$lib/server/db/schema';
import { createOrganization } from '$lib/server/seedPermissions';
import {
	checkTransaction,
	ownsFile,
	transactionTotals,
	type TransactionFilters
} from './transactions';

/** The money rules, against the real database, rolled back after each test. */

beforeAll(() => configureKit({ db }));

const range: TransactionFilters = {
	from: '2026-09-01',
	to: '2026-09-30',
	direction: '',
	status: '',
	purpose: '',
	methodId: 0,
	branchId: 0,
	q: ''
};

async function business(tx: TestTx) {
	const { orgId } = await createOrganization(tx, { name: 'Money test shop' });
	const [telebirr] = await tx
		.select({ id: paymentMethod.id })
		.from(paymentMethod)
		.where(and(eq(paymentMethod.orgId, orgId), eq(paymentMethod.name, 'Telebirr')));
	return { orgId, telebirr: telebirr.id };
}

async function record(
	tx: TestTx,
	orgId: number,
	values: Partial<typeof transactions.$inferInsert>
) {
	const [row] = await tx
		.insert(transactions)
		.values({ orgId, direction: 'in', amount: 100, occurredOn: '2026-09-10', ...values })
		.$returningId();
	return row.id;
}

const form = (values: Record<string, unknown>) => ({
	direction: 'in',
	amount: 500,
	occurredOn: '2026-09-15',
	purpose: 'sale',
	paymentMethodId: 0,
	branchId: 0,
	reference: '',
	...values
});

async function refusal(promise: Promise<unknown>) {
	try {
		await promise;
		return null;
	} catch (err) {
		if (err instanceof WriteRefused) return err.message;
		throw err;
	}
}

describe('checkTransaction', () => {
	it('refuses a transaction reference that is already recorded, whatever its case', async () => {
		const result = await inRollback(async (tx) => {
			const { orgId } = await business(tx);
			const first = await record(tx, orgId, { reference: 'FT24271ABCD' });
			return {
				first,
				again: await refusal(
					checkTransaction(form({ reference: 'ft24271abcd' }), orgId, undefined, tx)
				),
				// Editing the same transaction is not a duplicate of itself.
				self: await refusal(checkTransaction(form({ reference: 'FT24271ABCD' }), orgId, first, tx))
			};
		});
		expect(result.again).toMatch(new RegExp(`already recorded on transaction #${result.first}`));
		expect(result.self).toBeNull();
	});

	it('lets a voided transaction’s reference be used again', async () => {
		const refused = await inRollback(async (tx) => {
			const { orgId } = await business(tx);
			await record(tx, orgId, { reference: 'TB-9981', status: 'void' });
			return refusal(checkTransaction(form({ reference: 'TB-9981' }), orgId, undefined, tx));
		});
		expect(refused).toBeNull();
	});

	it('does not see another business’s references or payment methods', async () => {
		const result = await inRollback(async (tx) => {
			const one = await business(tx);
			const other = await business(tx);
			await record(tx, one.orgId, { reference: 'SHARED-1' });
			return {
				reference: await refusal(
					checkTransaction(form({ reference: 'SHARED-1' }), other.orgId, undefined, tx)
				),
				method: await refusal(
					checkTransaction(form({ paymentMethodId: one.telebirr }), other.orgId, undefined, tx)
				)
			};
		});
		expect(result.reference).toBeNull();
		expect(result.method).toMatch(/payment method/);
	});
});

describe('transactionTotals', () => {
	it('adds money in, takes money out, and ignores voided rows', async () => {
		const totals = await inRollback(async (tx) => {
			const { orgId } = await business(tx);
			await record(tx, orgId, { direction: 'in', amount: 1200.5 });
			await record(tx, orgId, { direction: 'in', amount: 300, status: 'verified' });
			await record(tx, orgId, { direction: 'out', amount: 450.25 });
			await record(tx, orgId, { direction: 'out', amount: 9999, status: 'void' });
			await record(tx, orgId, { direction: 'in', amount: 777, occurredOn: '2026-08-31' }); // outside
			return transactionTotals(orgId, range, tx);
		});
		expect(totals).toEqual({
			moneyIn: 1500.5,
			moneyOut: 450.25,
			net: 1050.25,
			count: 3,
			unverified: 2
		});
	});

	it('filters by direction and payment method', async () => {
		const result = await inRollback(async (tx) => {
			const { orgId, telebirr } = await business(tx);
			await record(tx, orgId, { direction: 'in', amount: 100, paymentMethodId: telebirr });
			await record(tx, orgId, { direction: 'in', amount: 50 });
			await record(tx, orgId, { direction: 'out', amount: 20, paymentMethodId: telebirr });
			return {
				telebirr: await transactionTotals(orgId, { ...range, methodId: telebirr }, tx),
				outOnly: await transactionTotals(orgId, { ...range, direction: 'out' }, tx)
			};
		});
		expect(result.telebirr).toMatchObject({ moneyIn: 100, moneyOut: 20, net: 80 });
		expect(result.outOnly).toMatchObject({ moneyIn: 0, moneyOut: 20, count: 1 });
	});
});

describe('ownsFile', () => {
	it('serves a stored file only to the business it belongs to', async () => {
		const result = await inRollback(async (tx) => {
			const one = await business(tx);
			const other = await business(tx);
			const txn = await record(tx, one.orgId, {});
			await tx.insert(transactionAttachment).values({
				orgId: one.orgId,
				transactionId: txn,
				fileName: 'test-owns-file.png'
			});
			return {
				owner: await ownsFile(one.orgId, 'test-owns-file.png', tx),
				other: await ownsFile(other.orgId, 'test-owns-file.png', tx),
				unknown: await ownsFile(one.orgId, 'nothing.png', tx)
			};
		});
		expect(result).toEqual({ owner: true, other: false, unknown: false });
	});
});
