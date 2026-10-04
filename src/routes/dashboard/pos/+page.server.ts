import { availabilityAt } from '$lib/server/stock/availability';
import { createHash } from 'node:crypto';
import { requireBranch, locationBranches } from '$lib/server/scope';
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
import { branchScope } from '$lib/server/scope';
import { kitsAvailable } from '$lib/server/items';
import { sellsToCustomers } from '$lib/server/customers';
import { priceTable } from '$lib/server/pricing';
import { checkout, checkoutOnce, checkoutResult, currentShift, heldCarts, holdCart, openShift, takeCart } from '$lib/server/pos';
import { afterSale } from '$lib/server/afterSale';
import { attempt, refusal } from '$lib/server/actions';
import { checkoutPayload } from '$lib/schemas/pos';
import { smsSettings } from '$lib/server/sms';
import { m } from '$lib/paraglide/messages.js';
import type { Actions, PageServerLoad } from './$types';

/**
 * Everything the till sells from this location, with its units, codes and what is on the shelf.
 * Services and kits sell too: a service has no stock to run out of, a kit as many as its
 * components on this shelf make.
 */
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
			name: sql<string>`IF(${item.variantLabel} IS NULL, ${item.name}, CONCAT(${item.name}, ' — ', ${item.variantLabel}))`,
			nameAm: item.nameAm,
			stockTracked: item.stockTracked,
			isKit: item.isKit,
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
	const availability = await availabilityAt(orgId, locationId, localToday());
	const kits = await kitsAvailable(
		orgId,
		items.filter((i) => i.isKit).map((i) => i.id),
		locationId,
		new Map([...availability].map(([id, value]) => [id, value.sellable]))
	);
	return items.map((i) => ({
		...i,
		kind: i.isKit ? ('kit' as const) : i.stockTracked ? ('stock' as const) : ('service' as const),
		/** Null: nothing to run out of (a service, or a kit made only of services). */
		onHand: i.isKit
			? (kits.get(i.id) ?? 0) < 0
				? null
				: (kits.get(i.id) ?? 0)
			: i.stockTracked
				? (availability.get(i.id)?.sellable ?? 0)
				: null,
		physical: availability.get(i.id)?.onHand ?? 0,
		reserved: availability.get(i.id)?.reserved ?? 0,
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
		const locations = await locationOptions(orgId, await branchScope(locals));
		return {
			shift: null,
			// Sales floors first: that is where a till usually sells from.
			locations: [...locations].sort(
				(a, b) => Number(b.kind === 'sales') - Number(a.kind === 'sales')
			)
		};
	}

	await requireBranch(locals, shift.branchId);
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
	await Promise.all(lists.map(async (l) => {
		priceTables[l.id] = Object.fromEntries(await priceTable(orgId, ids, l.id));
	}));

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
		orgId,
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
		canCredit: hasPermission(locals, 'customers.credit'),
		// The business sends texts: the till offers to text the receipt.
		smsReceipts: Boolean((await smsSettings(orgIdOf(locals)))?.enabled)
	};
};

export const actions: Actions = {
	status: async (event) => {
		requirePermission(event.locals, 'pos.use');
		const key = String((await event.request.formData()).get('requestKey') ?? '');
		const sale = await checkoutResult(orgIdOf(event.locals), event.locals.user!.id, key);
		return sale ? { sale: { ...sale, notes: [m.sales_checkout_recovered()], notesFailed: false } } : { notFound: true };
	},
	openShift: async (event) => {
		requirePermission(event.locals, 'pos.use');
		const data = await event.request.formData();
		const branches = await locationBranches(orgIdOf(event.locals), [Number(data.get('locationId'))]);
		await requireBranch(event.locals, branches.get(Number(data.get('locationId'))));
		const opened = await attempt(
			event,
			async () => {
				await db.transaction((tx) =>
					openShift(tx, {
						orgId: orgIdOf(event.locals),
						userId: event.locals.user!.id,
						locationId: Number(data.get('locationId')),
						openingFloat: Number(data.get('openingFloat') || 0)
					})
				);
				return null;
			},
			{ status: 400 }
		);
		if (!('done' in opened)) return opened;
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
			return refusal(m.sales_err_sale_unreadable(), 400);
		}
		const shift = await currentShift(orgId, userId);
		if (!shift) return refusal(m.sales_err_open_shift_first(), 409);
		const [org] = await db
			.select({ maxDiscountPercent: organization.maxDiscountPercent })
			.from(organization)
			.where(eq(organization.id, orgId));

		await requireBranch(event.locals, shift.branchId);
		let sale!: Awaited<ReturnType<typeof checkout>>;
		let replayed = false;
		const posted = await attempt(event, async () => {
			const answer = await db.transaction((tx) =>
				checkoutOnce(tx, {
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
				}, payload.requestKey, createHash('sha256').update(JSON.stringify(payload)).digest('hex'))
			);
			sale = answer.sale;
			replayed = answer.replayed;
			return null;
		});
		if (!('done' in posted)) return posted;
		const { notes, failed } = replayed ? { notes: [m.sales_checkout_recovered()], failed: false } : await afterSale(orgId, sale.documentId, {
			smsTo: payload.smsTo,
			userId
		});
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
			return refusal(m.sales_err_cart_unreadable(), 400);
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
		if (!row) return refusal(m.sales_err_cart_gone(), 404);
		return { taken: row.cart };
	}
};
