/**
 * The till. A POS sale is an ordinary sale — a posted issue with priced lines — made in one step:
 * the lines, the payments, the posting, all in one transaction. So everything that follows a sale
 * (credit, VAT/TOT, returns, the fiscal receipt, the e-invoice) follows a till sale too.
 *
 * Plain database code (the seed rings up its demo sales through here).
 */
import { and, desc, eq, inArray, isNull, ne, sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import {
	customer,
	item,
	itemUnit,
	location,
	paymentMethod,
	posCart,
	posShift,
	stockDocument,
	stockDocumentLine,
	transactions,
	user
} from '$lib/server/db/schema';
import { postDocument, StockError, type Tx } from '$lib/server/stock/post';
import { documentTotals } from '$lib/server/tax';
import { discountPercent, priceListOf, priceTable } from '$lib/server/pricing';

type Reader = Pick<typeof db, 'select'>;
const cents = (n: number) => Math.round(n * 100) / 100;

// ── Shifts ────────────────────────────────────────────────────────────────────────────────────

export async function currentShift(orgId: number, userId: string, reader: Reader = db) {
	const [row] = await reader
		.select({ shift: posShift, location: location.name, locationKind: location.kind })
		.from(posShift)
		.innerJoin(location, eq(location.id, posShift.locationId))
		.where(and(eq(posShift.orgId, orgId), eq(posShift.userId, userId), eq(posShift.status, 'open')))
		.orderBy(desc(posShift.id))
		.limit(1);
	return row ? { ...row.shift, location: row.location } : null;
}

export async function openShift(
	tx: Tx,
	input: { orgId: number; userId: string; locationId: number; openingFloat: number }
) {
	if (await currentShift(input.orgId, input.userId, tx)) {
		throw new StockError('You already have a shift open. Close it first.');
	}
	const [loc] = await tx
		.select({ id: location.id, branchId: location.branchId })
		.from(location)
		.where(
			and(
				eq(location.id, input.locationId),
				eq(location.orgId, input.orgId),
				isNull(location.deletedAt)
			)
		);
	if (!loc) throw new StockError('Choose the location this till sells from.');
	if (!(input.openingFloat >= 0)) throw new StockError('The opening float cannot be negative.');
	const [row] = await tx
		.insert(posShift)
		.values({
			orgId: input.orgId,
			branchId: loc.branchId,
			locationId: loc.id,
			userId: input.userId,
			openingFloat: cents(input.openingFloat)
		})
		.$returningId();
	return row.id;
}

/**
 * What a shift took, by payment method, and what the drawer should hold: the float, plus cash
 * taken, less cash paid out (refunds). Voided transactions left out.
 */
export async function shiftSummary(orgId: number, shiftId: number, reader: Reader = db) {
	const [shift] = await reader
		.select({ shift: posShift, cashier: user.name, location: location.name })
		.from(posShift)
		.innerJoin(user, eq(user.id, posShift.userId))
		.innerJoin(location, eq(location.id, posShift.locationId))
		.where(and(eq(posShift.id, shiftId), eq(posShift.orgId, orgId)));
	if (!shift) throw new StockError('That shift does not exist.');

	const [byMethod, [sales]] = await Promise.all([
		reader
			.select({
				method: sql<string>`COALESCE(${paymentMethod.name}, 'Not said')`,
				kind: paymentMethod.kind,
				moneyIn: sql<number>`SUM(CASE WHEN ${transactions.direction} = 'in' THEN ${transactions.amount} ELSE 0 END)`,
				moneyOut: sql<number>`SUM(CASE WHEN ${transactions.direction} = 'out' THEN ${transactions.amount} ELSE 0 END)`,
				count: sql<number>`COUNT(*)`
			})
			.from(transactions)
			.leftJoin(paymentMethod, eq(paymentMethod.id, transactions.paymentMethodId))
			.where(
				and(
					eq(transactions.orgId, orgId),
					eq(transactions.shiftId, shiftId),
					ne(transactions.status, 'void'),
					isNull(transactions.deletedAt)
				)
			)
			.groupBy(paymentMethod.name, paymentMethod.kind),
		reader
			.select({ count: sql<number>`COUNT(*)` })
			.from(stockDocument)
			.where(
				and(
					eq(stockDocument.shiftId, shiftId),
					eq(stockDocument.type, 'issue'),
					eq(stockDocument.status, 'posted')
				)
			)
	]);

	const methods = byMethod.map((m) => ({
		method: m.method,
		kind: m.kind,
		moneyIn: cents(Number(m.moneyIn)),
		moneyOut: cents(Number(m.moneyOut)),
		count: Number(m.count)
	}));
	const cash = methods.filter((m) => m.kind === 'cash');
	const expectedCash = cents(
		shift.shift.openingFloat + cash.reduce((s, m) => s + m.moneyIn - m.moneyOut, 0)
	);
	return {
		shift: shift.shift,
		cashier: shift.cashier,
		location: shift.location,
		sales: Number(sales.count),
		taken: cents(methods.reduce((s, m) => s + m.moneyIn, 0)),
		methods,
		expectedCash
	};
}

export async function closeShift(
	tx: Tx,
	input: { orgId: number; shiftId: number; userId: string; countedCash: number; note?: string }
) {
	const summary = await shiftSummary(input.orgId, input.shiftId, tx);
	if (summary.shift.status !== 'open') throw new StockError('This shift is already closed.');
	if (!(input.countedCash >= 0)) throw new StockError('Enter the cash counted in the drawer.');
	await tx
		.update(posShift)
		.set({
			status: 'closed',
			closedAt: new Date(),
			closedBy: input.userId,
			expectedCash: summary.expectedCash,
			countedCash: cents(input.countedCash),
			note: input.note || null
		})
		.where(eq(posShift.id, input.shiftId));
	return { ...summary, countedCash: cents(input.countedCash) };
}

// ── Checkout ──────────────────────────────────────────────────────────────────────────────────

export type CartLine = {
	itemId: number;
	uomId: number;
	quantity: number;
	/** Before VAT, per unit above. */
	unitPrice: number;
	lotId?: number | null;
	serials?: string[];
};
export type CartPayment = { methodId: number; amount: number; reference?: string };

/**
 * Rings up a sale at the till: checks the prices, records the payments, and posts it — in the
 * caller's transaction, so a refused sale leaves nothing behind.
 *
 * Paid more than the total? The change comes off the cash payment (only cash gives change).
 * Paid less? The rest goes on the customer's account (ዱቤ) — so a customer must be named, and
 * their credit limit applies.
 */
export async function checkout(
	tx: Tx,
	input: {
		orgId: number;
		userId: string;
		shiftId: number;
		customerId: number | null;
		lines: CartLine[];
		payments: CartPayment[];
		note?: string | null;
		today: string;
		/** The seller may take a customer over their credit limit. */
		allowOverLimit: boolean;
		/** The seller may discount beyond the business's limit, or sell below list price freely. */
		allowDiscount: boolean;
		/** The business's limit, in percent. Empty: none. */
		maxDiscountPercent: number | null;
	}
) {
	const [shift] = await tx
		.select()
		.from(posShift)
		.where(and(eq(posShift.id, input.shiftId), eq(posShift.orgId, input.orgId)));
	if (!shift || shift.status !== 'open') throw new StockError('Open a shift before selling.');
	if (shift.userId !== input.userId) throw new StockError('This shift belongs to someone else.');

	const lines = input.lines.filter((l) => l.quantity > 0);
	if (!lines.length) throw new StockError('The cart is empty.');

	let buyerName: string | null = null;
	if (input.customerId) {
		const [c] = await tx
			.select({ name: customer.name })
			.from(customer)
			.where(
				and(
					eq(customer.id, input.customerId),
					eq(customer.orgId, input.orgId),
					eq(customer.isActive, true),
					isNull(customer.deletedAt)
				)
			);
		if (!c) throw new StockError('Choose a customer from the list.');
		buyerName = c.name;
	}

	// Items, their units, and the prices they should sell at for this customer.
	const itemIds = [...new Set(lines.map((l) => l.itemId))];
	const [items, units] = await Promise.all([
		tx
			.select()
			.from(item)
			.where(and(eq(item.orgId, input.orgId), inArray(item.id, itemIds), isNull(item.deletedAt))),
		tx
			.select()
			.from(itemUnit)
			.where(and(inArray(itemUnit.itemId, itemIds), isNull(itemUnit.deletedAt)))
	]);
	const prices = await priceTable(
		input.orgId,
		itemIds,
		await priceListOf(input.orgId, input.customerId, tx),
		tx
	);

	for (const l of lines) {
		const it = items.find((i) => i.id === l.itemId);
		// Services and kits sell too: a service moves no stock, a kit takes its components.
		if (!it) throw new StockError('One of the items cannot be sold here.');
		if (!it.sellable || !it.isActive) throw new StockError(`${it.name} is not for sale.`);
		if (l.uomId !== it.baseUomId && !units.some((u) => u.itemId === it.id && u.uomId === l.uomId)) {
			throw new StockError(`${it.name} is not sold in that unit.`);
		}
		if (!(l.unitPrice >= 0)) throw new StockError(`Give ${it.name} a price.`);
		const list = prices.get(`${it.id}:${l.uomId}`) ?? null;
		const off = discountPercent(list, l.unitPrice);
		if (list === null && !input.allowDiscount && l.unitPrice === 0) {
			throw new StockError(`${it.name} has no price. Set one, or ask a manager.`);
		}
		if (
			off > 0 &&
			!input.allowDiscount &&
			input.maxDiscountPercent !== null &&
			off > input.maxDiscountPercent + 0.001
		) {
			throw new StockError(
				`${off}% off ${it.name} is more than the ${input.maxDiscountPercent}% you may give. Ask a manager.`
			);
		}
	}

	const stocked = new Set(items.filter((i) => i.stockTracked).map((i) => i.id));
	const [doc] = await tx
		.insert(stockDocument)
		.values({
			orgId: input.orgId,
			type: 'issue',
			branchId: shift.branchId,
			docDate: input.today,
			fromLocationId: shift.locationId,
			customerId: input.customerId,
			shiftId: shift.id,
			note: input.note || null,
			createdBy: input.userId
		})
		.$returningId();

	for (const l of lines) {
		const list = prices.get(`${l.itemId}:${l.uomId}`) ?? null;
		await tx.insert(stockDocumentLine).values({
			orgId: input.orgId,
			documentId: doc.id,
			itemId: l.itemId,
			uomId: l.uomId,
			quantity: l.quantity,
			unitPrice: l.unitPrice,
			listPrice: list !== null && list !== l.unitPrice ? list : null,
			lotId: stocked.has(l.itemId) ? l.lotId || null : null,
			serials: stocked.has(l.itemId) && l.serials?.length ? l.serials.join('\n') : null
		});
	}

	// What it comes to, VAT and TOT included, as posting will fix them.
	const totals = (await documentTotals(input.orgId, doc.id, tx))!;
	const due = totals.gross;

	const methods = await tx
		.select()
		.from(paymentMethod)
		.where(and(eq(paymentMethod.orgId, input.orgId), isNull(paymentMethod.deletedAt)));
	const payments = input.payments
		.filter((p) => p.amount > 0)
		.map((p) => {
			const m = methods.find((x) => x.id === p.methodId);
			if (!m) throw new StockError('Choose a payment method from the list.');
			return { ...p, amount: cents(p.amount), method: m };
		});

	let paid = cents(payments.reduce((s, p) => s + p.amount, 0));
	let change = 0;
	if (paid > due + 0.004) {
		// Only cash gives change: take it off the cash tendered.
		change = cents(paid - due);
		const cash = payments.find((p) => p.method.kind === 'cash' && p.amount >= change);
		if (!cash) {
			throw new StockError(
				'The payments come to more than the sale, and only cash gives change. Lower a payment.'
			);
		}
		cash.amount = cents(cash.amount - change);
		paid = due;
	}
	if (paid < due - 0.004 && !input.customerId) {
		throw new StockError(
			`Collect ${(due - paid).toFixed(2)} more, or choose a customer to put the rest on credit.`
		);
	}

	const ids: number[] = [];
	for (const p of payments.filter((x) => x.amount > 0)) {
		const reference = p.reference?.trim() || null;
		if (reference) {
			const [dup] = await tx
				.select({ id: transactions.id })
				.from(transactions)
				.where(
					and(
						eq(transactions.orgId, input.orgId),
						sql`LOWER(${transactions.reference}) = LOWER(${reference})`,
						ne(transactions.status, 'void'),
						isNull(transactions.deletedAt)
					)
				);
			if (dup) {
				throw new StockError(
					`Reference ${reference} is already recorded (transaction #${dup.id}). The same payment cannot be used twice.`
				);
			}
		}
		const [row] = await tx
			.insert(transactions)
			.values({
				orgId: input.orgId,
				branchId: shift.branchId,
				direction: 'in',
				amount: p.amount,
				occurredOn: input.today,
				paymentMethodId: p.method.id,
				purpose: 'sale',
				reference,
				party: buyerName ?? 'Walk-in',
				customerId: input.customerId,
				documentId: doc.id,
				shiftId: shift.id,
				createdBy: input.userId
			})
			.$returningId();
		ids.push(row.id);
	}
	if (ids.length) {
		await tx
			.update(stockDocument)
			.set({ transactionId: ids[0] })
			.where(eq(stockDocument.id, doc.id));
	}

	const { number } = await postDocument(tx, {
		orgId: input.orgId,
		documentId: doc.id,
		userId: input.userId,
		today: input.today,
		allowOverLimit: input.allowOverLimit
	});

	return {
		documentId: doc.id,
		number,
		total: due,
		paid,
		change,
		onCredit: cents(due - paid)
	};
}

// ── Held carts ────────────────────────────────────────────────────────────────────────────────

export async function holdCart(
	tx: Pick<typeof db, 'insert'>,
	input: {
		orgId: number;
		userId: string;
		shiftId: number | null;
		label: string | null;
		customerId: number | null;
		cart: unknown;
	}
) {
	const [row] = await tx
		.insert(posCart)
		.values({
			orgId: input.orgId,
			userId: input.userId,
			shiftId: input.shiftId,
			label: input.label,
			customerId: input.customerId,
			cart: JSON.stringify(input.cart)
		})
		.$returningId();
	return row.id;
}

export async function heldCarts(orgId: number, reader: Reader = db) {
	const rows = await reader
		.select({
			id: posCart.id,
			label: posCart.label,
			cart: posCart.cart,
			customerId: posCart.customerId,
			createdAt: posCart.createdAt,
			by: user.name
		})
		.from(posCart)
		.leftJoin(user, eq(user.id, posCart.userId))
		.where(eq(posCart.orgId, orgId))
		.orderBy(desc(posCart.id))
		.limit(50);
	return rows.map((r) => ({ ...r, cart: JSON.parse(r.cart) as unknown }));
}

/** Takes a held cart back: it leaves the list. */
export async function takeCart(tx: Tx, orgId: number, id: number) {
	const [row] = await tx
		.select()
		.from(posCart)
		.where(and(eq(posCart.id, id), eq(posCart.orgId, orgId)));
	if (!row) return null;
	await tx.delete(posCart).where(eq(posCart.id, row.id));
	return { ...row, cart: JSON.parse(row.cart) as unknown };
}
