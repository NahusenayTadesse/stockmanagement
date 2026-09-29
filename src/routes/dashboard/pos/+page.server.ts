import { fail } from '@sveltejs/kit';
import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { hasPermission, requirePermission } from '@nahu/admin-kit/server/permissions';
import { localToday } from '@nahu/admin-kit/time';
import { db } from '$lib/server/db';
import { qualified } from '$lib/server/db/sql';
import {
	barcode,
	category,
	customer,
	item,
	itemUnit,
	organization,
	paymentMethod,
	priceList,
	stockBalance,
	uom
} from '$lib/server/db/schema';
import { orgIdOf } from '$lib/server/tenant';
import { locationOptions } from '$lib/server/options';
import { sellsToCustomers } from '$lib/server/customers';
import { priceTable } from '$lib/server/pricing';
import { checkout, currentShift, heldCarts, holdCart, openShift, takeCart } from '$lib/server/pos';
import { afterSale } from '$lib/server/afterSale';
import { StockError } from '$lib/server/stock/post';
import { checkoutPayload } from '$lib/schemas/pos';
import type { Actions, PageServerLoad } from './$types';

/** Everything the till sells from this location, with its units, codes and what is on the shelf. */
async function catalogue(orgId: number, locationId: number) {
	const onHand = sql<number>`COALESCE((
		SELECT SUM(${qualified(stockBalance, stockBalance.quantity)}) FROM ${stockBalance}
		WHERE ${qualified(stockBalance, stockBalance.itemId)} = ${qualified(item, item.id)}
			AND ${qualified(stockBalance, stockBalance.locationId)} = ${locationId}
	), 0)`;
	const items = await db
		.select({
			id: item.id,
			sku: item.sku,
			name: item.name,
			nameAm: item.nameAm,
			category: category.name,
			baseUomId: item.baseUomId,
			unit: uom.symbol,
			taxCode: item.taxCode,
			totRate: item.totRate,
			trackSerials: item.trackSerials,
			onHand
		})
		.from(item)
		.innerJoin(uom, eq(uom.id, item.baseUomId))
		.leftJoin(category, eq(category.id, item.categoryId))
		.where(
			and(
				eq(item.orgId, orgId),
				eq(item.sellable, true),
				eq(item.stockTracked, true),
				eq(item.isActive, true),
				isNull(item.deletedAt)
			)
		)
		.orderBy(asc(item.name));
	const ids = items.map((i) => i.id);
	const [units, codes] = ids.length
		? await Promise.all([
				db
					.select({
						itemId: itemUnit.itemId,
						uomId: itemUnit.uomId,
						factor: itemUnit.factor,
						unit: uom.symbol
					})
					.from(itemUnit)
					.innerJoin(uom, eq(uom.id, itemUnit.uomId))
					.where(and(inArray(itemUnit.itemId, ids), isNull(itemUnit.deletedAt))),
				db
					.select({ itemId: barcode.itemId, code: barcode.code, uomId: barcode.uomId })
					.from(barcode)
					.where(and(eq(barcode.orgId, orgId), isNull(barcode.deletedAt)))
			])
		: [[], []];
	return items.map((i) => ({
		...i,
		onHand: Number(i.onHand),
		units: [
			{ uomId: i.baseUomId, unit: i.unit, factor: 1 },
			...units
				.filter((u) => u.itemId === i.id && u.uomId !== i.baseUomId)
				.map(({ uomId, unit, factor }) => ({ uomId, unit, factor }))
		],
		barcodes: codes.filter((c) => c.itemId === i.id).map(({ code, uomId }) => ({ code, uomId }))
	}));
}

export const load: PageServerLoad = async ({ locals }) => {
	const orgId = orgIdOf(locals);
	const userId = locals.user!.id;
	const shift = await currentShift(orgId, userId);

	if (!shift) {
		const locations = await locationOptions(orgId);
		return {
			shift: null,
			// Sales floors first: that is where a till usually sells from.
			locations: [...locations].sort(
				(a, b) => Number(b.kind === 'sales') - Number(a.kind === 'sales')
			)
		};
	}

	const [items, [org], methods, lists, sells, held] = await Promise.all([
		catalogue(orgId, shift.locationId),
		db
			.select({
				vatRegistered: organization.vatRegistered,
				vatRate: organization.vatRate,
				totRate: organization.totRate,
				maxDiscountPercent: organization.maxDiscountPercent
			})
			.from(organization)
			.where(eq(organization.id, orgId)),
		db
			.select({ id: paymentMethod.id, name: paymentMethod.name, kind: paymentMethod.kind })
			.from(paymentMethod)
			.where(
				and(
					eq(paymentMethod.orgId, orgId),
					eq(paymentMethod.status, true),
					isNull(paymentMethod.deletedAt)
				)
			)
			.orderBy(asc(paymentMethod.id)),
		db
			.select({ id: priceList.id })
			.from(priceList)
			.where(
				and(eq(priceList.orgId, orgId), eq(priceList.isActive, true), isNull(priceList.deletedAt))
			),
		sellsToCustomers(orgId),
		heldCarts(orgId)
	]);

	const ids = items.map((i) => i.id);
	// List prices, and each price list's, by `itemId:uomId` — so choosing a customer reprices the
	// cart at once.
	const priceTables: Record<string, Record<string, number | null>> = {
		list: Object.fromEntries(await priceTable(orgId, ids, null))
	};
	for (const l of lists) {
		priceTables[l.id] = Object.fromEntries(await priceTable(orgId, ids, l.id));
	}

	const customers = sells
		? await db
				.select({
					value: customer.id,
					name: sql<string>`CONCAT(${customer.name}, IF(${customer.phone} IS NULL, '', CONCAT(' · ', ${customer.phone})))`,
					priceListId: customer.priceListId
				})
				.from(customer)
				.where(
					and(eq(customer.orgId, orgId), eq(customer.isActive, true), isNull(customer.deletedAt))
				)
				.orderBy(asc(customer.name))
		: null;

	return {
		shift,
		items,
		priceTables,
		customers,
		methods,
		held,
		tax: {
			vatRegistered: org.vatRegistered,
			vatRate: org.vatRate,
			totRate: org.totRate
		},
		maxDiscountPercent: org.maxDiscountPercent,
		canDiscount: hasPermission(locals, 'sales.discount'),
		canCredit: hasPermission(locals, 'customers.credit')
	};
};

export const actions: Actions = {
	openShift: async (event) => {
		requirePermission(event.locals, 'pos.use');
		const data = await event.request.formData();
		try {
			await db.transaction((tx) =>
				openShift(tx, {
					orgId: orgIdOf(event.locals),
					userId: event.locals.user!.id,
					locationId: Number(data.get('locationId')),
					openingFloat: Number(data.get('openingFloat') || 0)
				})
			);
		} catch (err) {
			if (err instanceof StockError) return fail(400, { error: err.message });
			throw err;
		}
		return { opened: true };
	},

	/** Rings up the sale: priced, paid, posted — then the fiscal receipt and e-invoice, if set up. */
	checkout: async (event) => {
		requirePermission(event.locals, 'pos.use');
		const orgId = orgIdOf(event.locals);
		const userId = event.locals.user!.id;
		let payload;
		try {
			payload = checkoutPayload.parse(
				JSON.parse(String((await event.request.formData()).get('payload')))
			);
		} catch {
			return fail(400, { error: 'The sale could not be read. Try again.' });
		}
		const shift = await currentShift(orgId, userId);
		if (!shift) return fail(409, { error: 'Open a shift before selling.' });
		const [org] = await db
			.select({ maxDiscountPercent: organization.maxDiscountPercent })
			.from(organization)
			.where(eq(organization.id, orgId));

		let sale;
		try {
			sale = await db.transaction((tx) =>
				checkout(tx, {
					orgId,
					userId,
					shiftId: shift.id,
					customerId: payload.customerId,
					note: payload.note,
					lines: payload.lines,
					payments: payload.payments,
					today: localToday(),
					allowOverLimit: hasPermission(event.locals, 'customers.credit'),
					allowDiscount: hasPermission(event.locals, 'sales.discount'),
					maxDiscountPercent: org.maxDiscountPercent
				})
			);
		} catch (err) {
			if (err instanceof StockError) return fail(409, { error: err.message });
			throw err;
		}
		const { notes, failed } = await afterSale(orgId, sale.documentId);
		return { sale: { ...sale, notes, notesFailed: failed } };
	},

	/** Puts the cart aside, to be taken up again. */
	hold: async (event) => {
		requirePermission(event.locals, 'pos.use');
		const orgId = orgIdOf(event.locals);
		const data = await event.request.formData();
		let cart: unknown;
		try {
			cart = JSON.parse(String(data.get('cart')));
		} catch {
			return fail(400, { error: 'The cart could not be read.' });
		}
		const shift = await currentShift(orgId, event.locals.user!.id);
		await holdCart(db, {
			orgId,
			userId: event.locals.user!.id,
			shiftId: shift?.id ?? null,
			label: String(data.get('label') ?? '').slice(0, 80) || null,
			customerId: Number(data.get('customerId')) || null,
			cart
		});
		return { held: true };
	},

	/** Takes a held cart back into the till. */
	take: async (event) => {
		requirePermission(event.locals, 'pos.use');
		const id = Number((await event.request.formData()).get('id'));
		const row = await db.transaction((tx) => takeCart(tx, orgIdOf(event.locals), id));
		if (!row) return fail(404, { error: 'That cart is gone — someone else took it.' });
		return { taken: row.cart };
	}
};
