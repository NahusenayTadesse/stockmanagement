import { beforeAll, describe, expect, it } from 'vitest';
import { and, eq, sql } from 'drizzle-orm';
import { configureKit } from '@nahu/admin-kit/server/db';
import { inRollback, type TestTx } from '@nahu/admin-kit/server/testing/rollback';

import { db } from '$lib/server/db';
import {
	branch,
	category,
	costLayer,
	item,
	kitComponent,
	landedCost,
	location,
	organization,
	quote,
	quoteLine,
	requisition,
	requisitionLine,
	roles,
	serialUnit,
	stockBalance,
	stockDocument,
	stockDocumentLine,
	stockMovement,
	stockReservation,
	supplier,
	uom,
	user
} from '$lib/server/db/schema';
import { createOrganization } from '$lib/server/seedPermissions';
import { ApprovalRequired, postDocument, StockError } from './post';
import { receiveTransfer } from './transit';
import { startFifo } from './ledger';
import { reserveQuote } from '$lib/server/reservations';
import { createReturn } from '$lib/server/returns';
import { decideApproval, requestApproval } from '$lib/server/approvals';
import {
	decideRequisition,
	issueFromRequisition,
	submitRequisition
} from '$lib/server/requisitions';

/**
 * Stock control: transfers in transit, reservations, FIFO, landed costs, kits and services,
 * shelf-life rules, maker-checker and requisitions. Each test builds a business in a transaction
 * that is rolled back.
 */

beforeAll(() => configureKit({ db }));

const TODAY = '2026-09-29';

async function business(tx: TestTx) {
	const { orgId, branchId } = await createOrganization(tx, { name: 'Control test' });
	const [store] = await tx
		.select()
		.from(location)
		.where(and(eq(location.orgId, orgId), eq(location.kind, 'storage')));
	const [far] = await tx
		.insert(branch)
		.values({ orgId, name: 'Hawassa', code: 'HAW' })
		.$returningId();
	const [farStore] = await tx
		.insert(location)
		.values({ orgId, branchId: far.id, name: 'Hawassa store' })
		.$returningId();
	const units = await tx.select().from(uom).where(eq(uom.orgId, orgId));
	const unit = (name: string) => units.find((u) => u.name === name)!.id;
	const [sup] = await tx
		.insert(supplier)
		.values({ orgId, name: 'Supplier', phone: '0911000000' })
		.$returningId();
	const [role] = await tx.select().from(roles).where(eq(roles.orgId, orgId)).limit(1);
	const person = async (name: string) => {
		const id = `ctl-${name}-${Math.random().toString(36).slice(2)}`;
		await tx.insert(user).values({
			id,
			name,
			email: `${id}@example.com`,
			emailVerified: true,
			orgId,
			roleId: role.id
		});
		return id;
	};
	const maker = await person('maker');
	const checker = await person('checker');

	const newItem = async (values: Partial<typeof item.$inferInsert> = {}) => {
		const [row] = await tx
			.insert(item)
			.values({
				orgId,
				sku: `SKU-${Math.random().toString(36).slice(2, 8)}`,
				name: 'Cup',
				baseUomId: unit('Piece'),
				supplierId: sup.id,
				salePrice: 100,
				...values
			})
			.$returningId();
		return row.id;
	};

	const doc = async (
		values: Partial<typeof stockDocument.$inferInsert> & {
			type: (typeof stockDocument.$inferInsert)['type'];
		},
		lines: Partial<typeof stockDocumentLine.$inferInsert>[]
	) => {
		const [d] = await tx
			.insert(stockDocument)
			.values({
				orgId,
				branchId,
				docDate: TODAY,
				supplierId: values.type === 'receipt' ? sup.id : null,
				...values
			})
			.$returningId();
		for (const l of lines) {
			await tx.insert(stockDocumentLine).values({
				orgId,
				documentId: d.id,
				itemId: l.itemId!,
				uomId: l.uomId ?? unit('Piece'),
				quantity: l.quantity!,
				...l
			});
		}
		return d.id;
	};

	const post = (documentId: number, more: { approved?: boolean; userId?: string } = {}) =>
		postDocument(tx, { orgId, documentId, today: TODAY, ...more });

	const receive = async (itemId: number, quantity: number, unitCost: number, extra = {}) =>
		post(
			await doc({ type: 'receipt', toLocationId: store.id }, [
				{ itemId, quantity, unitCost, ...extra }
			])
		);

	const balance = async (itemId: number, locationId: number) => {
		const [row] = await tx
			.select({ q: sql<number>`COALESCE(SUM(${stockBalance.quantity}), 0)` })
			.from(stockBalance)
			.where(and(eq(stockBalance.itemId, itemId), eq(stockBalance.locationId, locationId)));
		return Number(row.q);
	};

	const setOrg = (values: Partial<typeof organization.$inferInsert>) =>
		tx.update(organization).set(values).where(eq(organization.id, orgId));

	return {
		orgId,
		branchId,
		farBranch: far.id,
		store: store.id,
		farStore: farStore.id,
		unit,
		supplier: sup.id,
		maker,
		checker,
		newItem,
		doc,
		post,
		receive,
		balance,
		setOrg
	};
}

async function refusal(promise: Promise<unknown>) {
	try {
		await promise;
		return null;
	} catch (err) {
		if (err instanceof StockError) return err;
		throw err;
	}
}

describe('transfers between branches', () => {
	it('go into transit, and arrive only as received; what is missing is written off', async () => {
		const r = await inRollback(async (tx) => {
			const b = await business(tx);
			const cup = await b.newItem();
			const phone = await b.newItem({ name: 'Phone', trackSerials: true });
			await b.receive(cup, 10, 40);
			await b.receive(phone, 2, 5000, { serials: 'P1\nP2' });

			const trf = await b.doc(
				{
					type: 'transfer',
					fromLocationId: b.store,
					toLocationId: b.farStore,
					driverName: 'Abebe',
					vehiclePlate: 'AA-3-12345'
				},
				[
					{ itemId: cup, quantity: 10 },
					{ itemId: phone, quantity: 2, serials: 'P1\nP2' }
				]
			);
			const sent = await b.post(trf);
			const [d] = await tx.select().from(stockDocument).where(eq(stockDocument.id, trf));
			const whileAway = {
				here: await b.balance(cup, b.store),
				there: await b.balance(cup, b.farStore),
				transit: await b.balance(cup, d.transitLocationId!)
			};
			const lines = await tx
				.select()
				.from(stockDocumentLine)
				.where(eq(stockDocumentLine.documentId, trf));
			const cupLine = lines.find((l) => l.itemId === cup)!;
			const phoneLine = lines.find((l) => l.itemId === phone)!;
			const tooMany = await refusal(
				tx.transaction((sp) =>
					receiveTransfer(sp, {
						orgId: b.orgId,
						documentId: trf,
						today: TODAY,
						arrivals: [{ lineId: cupLine.id, quantity: 11 }]
					})
				)
			);
			const got = await receiveTransfer(tx, {
				orgId: b.orgId,
				documentId: trf,
				today: TODAY,
				arrivals: [
					{ lineId: cupLine.id, quantity: 8 },
					{ lineId: phoneLine.id, quantity: 1, serials: ['P2'] }
				]
			});
			const [after] = await tx.select().from(stockDocument).where(eq(stockDocument.id, trf));
			const units = await tx.select().from(serialUnit).where(eq(serialUnit.itemId, phone));
			const lost = await tx
				.select()
				.from(stockMovement)
				.where(and(eq(stockMovement.documentId, trf), eq(stockMovement.kind, 'transit_loss')));
			return {
				sent,
				whileAway,
				tooMany: tooMany?.message,
				got,
				after,
				arrived: await b.balance(cup, b.farStore),
				stillInTransit: await b.balance(cup, d.transitLocationId!),
				units,
				lost,
				farStore: b.farStore
			};
		});
		expect(r.sent.status).toBe('in_transit');
		expect(r.whileAway).toEqual({ here: 0, there: 0, transit: 10 });
		expect(r.tooMany).toMatch(/More of Cup arrived than was sent/);
		expect(r.got.lost.map((l) => [l.item, l.quantity])).toEqual([
			['Cup', 2],
			['Phone', 1]
		]);
		expect(r.after.status).toBe('posted');
		expect(r.arrived).toBe(8);
		expect(r.stillInTransit).toBe(0);
		expect(r.units.find((u) => u.serialNumber === 'P2')).toMatchObject({
			status: 'in_stock',
			locationId: r.farStore
		});
		expect(r.units.find((u) => u.serialNumber === 'P1')?.status).toBe('disposed');
		expect(r.lost.map((m) => Number(m.quantity)).sort((a, b) => a - b)).toEqual([-2, -1]);
	});
});

describe('reservations', () => {
	it('keep stock held for an accepted proforma from other sales, and release it on its sale', async () => {
		const r = await inRollback(async (tx) => {
			const b = await business(tx);
			await b.setOrg({ reserveStock: true });
			const cup = await b.newItem();
			await b.receive(cup, 10, 40);

			const [q] = await tx
				.insert(quote)
				.values({
					orgId: b.orgId,
					branchId: b.branchId,
					quoteDate: TODAY,
					status: 'accepted',
					locationId: b.store
				})
				.$returningId();
			await tx.insert(quoteLine).values({
				orgId: b.orgId,
				quoteId: q.id,
				itemId: cup,
				uomId: b.unit('Piece'),
				quantity: 7,
				unitPrice: 100
			});
			await reserveQuote(tx, { orgId: b.orgId, quoteId: q.id });

			const walkIn = await refusal(
				tx.transaction(async (sp) =>
					postDocument(sp, {
						orgId: b.orgId,
						today: TODAY,
						documentId: await b.doc({ type: 'issue', fromLocationId: b.store }, [
							{ itemId: cup, quantity: 4, unitPrice: 100 }
						])
					})
				)
			);
			const small = await b.post(
				await b.doc({ type: 'issue', fromLocationId: b.store }, [
					{ itemId: cup, quantity: 3, unitPrice: 100 }
				])
			);
			const theSale = await b.post(
				await b.doc({ type: 'issue', fromLocationId: b.store, quoteId: q.id }, [
					{ itemId: cup, quantity: 7, unitPrice: 100 }
				])
			);
			const left = await tx
				.select()
				.from(stockReservation)
				.where(eq(stockReservation.quoteId, q.id));
			return { walkIn: walkIn?.message, small, theSale, left };
		});
		expect(r.walkIn).toMatch(/Only 3 pcs of Cup is free .* 7 pcs is held/);
		expect(r.small.status).toBe('posted');
		expect(r.theSale.status).toBe('posted');
		expect(r.left).toEqual([]);
	});
});

describe('costing', () => {
	it('by FIFO values sales at the oldest purchases, and keeps the average on what is left', async () => {
		const r = await inRollback(async (tx) => {
			const b = await business(tx);
			const cup = await b.newItem();
			await b.receive(cup, 10, 10);
			await b.setOrg({ costingMethod: 'fifo' });
			await startFifo(tx, b.orgId, TODAY);
			await b.receive(cup, 10, 20);
			const sale = await b.doc({ type: 'issue', fromLocationId: b.store }, [
				{ itemId: cup, quantity: 15, unitPrice: 50 }
			]);
			await b.post(sale);
			const [out] = await tx
				.select({ cost: stockMovement.unitCost })
				.from(stockMovement)
				.where(eq(stockMovement.documentId, sale));
			const [it] = await tx.select().from(item).where(eq(item.id, cup));
			const layers = await tx.select().from(costLayer).where(eq(costLayer.itemId, cup));
			return { cost: out.cost, avg: it.avgCost, remaining: layers.map((l) => Number(l.remaining)) };
		});
		// 10 at 10 + 5 at 20 = 200 for 15.
		expect(r.cost).toBeCloseTo(13.3333, 3);
		expect(r.avg).toBe(20);
		expect(r.remaining).toEqual([0, 5]);
	});

	it('adds landed costs to what the stock cost, shared by value or weight', async () => {
		const r = await inRollback(async (tx) => {
			const b = await business(tx);
			const cup = await b.newItem({ weightKg: 1 });
			const pot = await b.newItem({ name: 'Pot', weightKg: 3 });
			const grn = await b.doc(
				{ type: 'receipt', toLocationId: b.store, currency: 'USD', exchangeRate: 150 },
				[
					{ itemId: cup, quantity: 10, unitCost: 100 },
					{ itemId: pot, quantity: 10, unitCost: 300 }
				]
			);
			await tx.insert(landedCost).values([
				{ orgId: b.orgId, documentId: grn, kind: 'duty', amount: 800, method: 'value' },
				{ orgId: b.orgId, documentId: grn, kind: 'freight', amount: 400, method: 'weight' }
			]);
			await b.post(grn);
			const lines = await tx
				.select()
				.from(stockDocumentLine)
				.where(eq(stockDocumentLine.documentId, grn));
			const items = await tx.select().from(item).where(eq(item.orgId, b.orgId));
			return {
				landed: Object.fromEntries(lines.map((l) => [l.itemId, l.landedCost])),
				avg: Object.fromEntries(items.map((i) => [i.id, i.avgCost])),
				cup,
				pot
			};
		});
		// Duty 800 by value (1000 : 3000) → 200 : 600. Freight 400 by weight (10 : 30) → 100 : 300.
		expect(r.landed[r.cup]).toBe(300);
		expect(r.landed[r.pot]).toBe(900);
		expect(r.avg[r.cup]).toBe(130);
		expect(r.avg[r.pot]).toBe(390);
	});
});

describe('kits and services', () => {
	it('sell a kit as its components and a service without stock; a returned kit comes back', async () => {
		const r = await inRollback(async (tx) => {
			const b = await business(tx);
			const cup = await b.newItem();
			const saucer = await b.newItem({ name: 'Saucer' });
			await b.receive(cup, 20, 40);
			await b.receive(saucer, 20, 10);
			const set = await b.newItem({
				name: 'Tea set',
				stockTracked: false,
				isKit: true,
				salePrice: 500
			});
			const delivery = await b.newItem({ name: 'Delivery', stockTracked: false, salePrice: 50 });
			await tx.insert(kitComponent).values([
				{
					orgId: b.orgId,
					kitItemId: set,
					componentItemId: cup,
					uomId: b.unit('Piece'),
					quantity: 2
				},
				{
					orgId: b.orgId,
					kitItemId: set,
					componentItemId: saucer,
					uomId: b.unit('Piece'),
					quantity: 2
				}
			]);
			const sale = await b.doc({ type: 'issue', fromLocationId: b.store }, [
				{ itemId: set, quantity: 3, unitPrice: 500 },
				{ itemId: delivery, quantity: 1, unitPrice: 50 }
			]);
			await b.post(sale);
			const afterSale = [await b.balance(cup, b.store), await b.balance(saucer, b.store)];

			const ret = await createReturn(tx, { orgId: b.orgId, documentId: sale, date: TODAY });
			const retLines = await tx
				.select()
				.from(stockDocumentLine)
				.where(eq(stockDocumentLine.documentId, ret));
			// One tea set comes back; the delivery was done.
			for (const l of retLines) {
				if (l.itemId === set) {
					await tx
						.update(stockDocumentLine)
						.set({ quantity: 1 })
						.where(eq(stockDocumentLine.id, l.id));
				} else {
					await tx
						.update(stockDocumentLine)
						.set({ deletedAt: new Date() })
						.where(eq(stockDocumentLine.id, l.id));
				}
			}
			await b.post(ret);
			return {
				afterSale,
				afterReturn: [await b.balance(cup, b.store), await b.balance(saucer, b.store)],
				returnable: retLines.map((l) => [l.itemId === set ? 'set' : 'delivery', l.quantity]).sort()
			};
		});
		expect(r.afterSale).toEqual([14, 14]);
		expect(r.returnable).toEqual([
			['delivery', 1],
			['set', 3]
		]);
		expect(r.afterReturn).toEqual([16, 16]);
	});
});

describe('shelf-life rules', () => {
	it('flag a delivery with too little shelf life left, or refuse it', async () => {
		const r = await inRollback(async (tx) => {
			const b = await business(tx);
			const [cat] = await tx
				.insert(category)
				.values({ orgId: b.orgId, name: 'Medicine', minShelfLifeDays: 180 })
				.$returningId();
			const amox = await b.newItem({
				name: 'Amoxicillin',
				categoryId: cat.id,
				trackLots: true,
				trackExpiry: true
			});
			const flagged = await b.receive(amox, 10, 5, { lotNumber: 'L1', expiryDate: '2026-11-28' });
			await tx.update(category).set({ refuseShortShelfLife: true }).where(eq(category.id, cat.id));
			const refused = await refusal(
				tx.transaction(() => b.receive(amox, 10, 5, { lotNumber: 'L2', expiryDate: '2026-12-01' }))
			);
			const fine = await b.receive(amox, 10, 5, { lotNumber: 'L3', expiryDate: '2027-09-29' });
			return { flagged: flagged.warnings, refused: refused?.message, fine: fine.warnings };
		});
		expect(r.flagged[0]).toMatch(/Lot L1 of Amoxicillin has 60 day\(s\) .* at least 180/);
		expect(r.refused).toMatch(/Refuse the delivery/);
		expect(r.fine).toEqual([]);
	});
});

describe('maker-checker', () => {
	it('holds a large adjustment for someone else to approve, which posts it', async () => {
		const r = await inRollback(async (tx) => {
			const b = await business(tx);
			await b.setOrg({ approveAdjustmentsOver: 1000 });
			const cup = await b.newItem();
			await b.receive(cup, 100, 40);
			const small = await b.doc({ type: 'adjustment', fromLocationId: b.store, reason: 'damage' }, [
				{ itemId: cup, quantity: -2 }
			]);
			await b.post(small);
			const big = await b.doc({ type: 'adjustment', fromLocationId: b.store, reason: 'damage' }, [
				{ itemId: cup, quantity: -30 }
			]);
			const held = await refusal(tx.transaction(() => b.post(big)));
			const requestId = await requestApproval(
				{
					orgId: b.orgId,
					userId: b.maker,
					subject: { kind: 'adjustment', documentId: big },
					refusal: held as ApprovalRequired
				},
				tx
			);
			const again = await requestApproval(
				{
					orgId: b.orgId,
					userId: b.maker,
					subject: { kind: 'adjustment', documentId: big },
					refusal: held as ApprovalRequired
				},
				tx
			);
			const self = await refusal(
				tx.transaction((sp) =>
					decideApproval(sp, {
						orgId: b.orgId,
						requestId,
						userId: b.maker,
						approve: true,
						today: TODAY
					})
				)
			);
			const decided = await decideApproval(tx, {
				orgId: b.orgId,
				requestId,
				userId: b.checker,
				approve: true,
				today: TODAY
			});
			const [d] = await tx.select().from(stockDocument).where(eq(stockDocument.id, big));
			return {
				held,
				same: again === requestId,
				self: self?.message,
				decided,
				d,
				left: await b.balance(cup, b.store)
			};
		});
		expect(r.held).toBeInstanceOf(ApprovalRequired);
		expect((r.held as ApprovalRequired).value).toBe(1200);
		expect(r.same).toBe(true);
		expect(r.self).toMatch(/someone else has to approve/);
		expect(r.decided.done).toMatch(/Approved and posted as/);
		expect(r.d).toMatchObject({ status: 'posted', postedBy: expect.stringContaining('checker') });
		expect(r.left).toBe(68);
	});
});

describe('requisitions', () => {
	it('are submitted, approved (and cut) by someone else, held, then filled by an issue', async () => {
		const r = await inRollback(async (tx) => {
			const b = await business(tx);
			await b.setOrg({ reserveStock: true });
			const gloves = await b.newItem({ name: 'Gloves' });
			await b.receive(gloves, 50, 5);
			const [req] = await tx
				.insert(requisition)
				.values({
					orgId: b.orgId,
					branchId: b.branchId,
					department: 'Surgical ward',
					requestDate: TODAY,
					locationId: b.store
				})
				.$returningId();
			const [line] = await tx
				.insert(requisitionLine)
				.values({
					orgId: b.orgId,
					requisitionId: req.id,
					itemId: gloves,
					uomId: b.unit('Piece'),
					quantity: 40
				})
				.$returningId();
			const number = await submitRequisition(tx, {
				orgId: b.orgId,
				requisitionId: req.id,
				userId: b.maker
			});
			const self = await refusal(
				tx.transaction((sp) =>
					decideRequisition(sp, {
						orgId: b.orgId,
						requisitionId: req.id,
						userId: b.maker,
						approve: true
					})
				)
			);
			await decideRequisition(tx, {
				orgId: b.orgId,
				requisitionId: req.id,
				userId: b.checker,
				approve: true,
				quantities: new Map([[line.id, 30]])
			});
			const held = await tx
				.select()
				.from(stockReservation)
				.where(eq(stockReservation.requisitionId, req.id));
			const issueId = await issueFromRequisition(tx, {
				orgId: b.orgId,
				requisitionId: req.id,
				date: TODAY
			});
			const [issueLine] = await tx
				.select()
				.from(stockDocumentLine)
				.where(eq(stockDocumentLine.documentId, issueId));
			await b.post(issueId);
			const [after] = await tx.select().from(requisition).where(eq(requisition.id, req.id));
			const heldAfter = await tx
				.select()
				.from(stockReservation)
				.where(eq(stockReservation.requisitionId, req.id));
			return {
				number,
				self: self?.message,
				held,
				issueLine,
				after,
				heldAfter,
				left: await b.balance(gloves, b.store),
				issueId
			};
		});
		expect(r.number).toMatch(/-REQ-/);
		expect(r.self).toMatch(/someone else has to approve/);
		expect(r.held.map((h) => Number(h.quantity))).toEqual([30]);
		expect(r.issueLine.quantity).toBe(30);
		expect(r.after).toMatchObject({ status: 'issued', issueId: r.issueId });
		expect(r.heldAfter).toEqual([]);
		expect(r.left).toBe(20);
	});
});
