/**
 * Stock counts. Opening one snapshots what the system expects at a location; people enter what
 * they find; posting writes the differences as one adjustment (reason: count) through the ordinary
 * posting service. The count itself never touches stock.
 *
 * Serial-tracked items are left out: counting them means checking serial numbers, not a number of
 * units, and a quantity difference could not say which unit is missing.
 */
import { error } from '@sveltejs/kit';
import { and, asc, eq, gt, inArray, isNull, sql } from 'drizzle-orm';
import { localToday } from '@nahu/admin-kit/time';
import { db } from '$lib/server/db';
import {
	category,
	item,
	location,
	lot,
	stockBalance,
	stockCount,
	stockCountLine,
	stockDocument,
	stockDocumentLine,
	stockMovement,
	uom
} from '$lib/server/db/schema';
import { postDocument, StockError, type Tx } from '$lib/server/stock/post';
import { round4 } from '$lib/server/stock/math';

type Writer = typeof db | Tx;

export async function orgCount(orgId: number, id: number, reader: Writer = db) {
	const [row] = await reader
		.select()
		.from(stockCount)
		.where(and(eq(stockCount.id, id), eq(stockCount.orgId, orgId), isNull(stockCount.deletedAt)));
	if (!row) error(404, 'Count not found');
	return row;
}

/** Opens a count and takes the snapshot, in one transaction. Returns its id. */
export async function openCount(
	tx: Tx,
	input: {
		orgId: number;
		locationId: number;
		categoryId: number | null;
		blind: boolean;
		countDate: string;
		note: string | null;
		userId?: string;
	}
): Promise<number> {
	const [loc] = await tx
		.select()
		.from(location)
		.where(and(eq(location.id, input.locationId), eq(location.orgId, input.orgId)));
	if (!loc) throw new StockError('Choose a location from the list.');

	const [open] = await tx
		.select({ id: stockCount.id })
		.from(stockCount)
		.where(
			and(
				eq(stockCount.locationId, loc.id),
				eq(stockCount.status, 'open'),
				isNull(stockCount.deletedAt)
			)
		);
	if (open) {
		throw new StockError(
			`Count #${open.id} of this location is still open. Finish or cancel it first.`
		);
	}

	const [created] = await tx
		.insert(stockCount)
		.values({
			orgId: input.orgId,
			branchId: loc.branchId,
			locationId: loc.id,
			categoryId: input.categoryId,
			countDate: input.countDate,
			blind: input.blind,
			note: input.note,
			createdBy: input.userId
		})
		.$returningId();

	// The snapshot: every lot of every counted item with stock here.
	const snapshot = await tx
		.select({
			itemId: stockBalance.itemId,
			lotId: stockBalance.lotId,
			quantity: stockBalance.quantity
		})
		.from(stockBalance)
		.innerJoin(item, eq(item.id, stockBalance.itemId))
		.where(
			and(
				eq(stockBalance.locationId, loc.id),
				gt(stockBalance.quantity, 0),
				eq(item.trackSerials, false),
				input.categoryId ? eq(item.categoryId, input.categoryId) : undefined
			)
		);

	if (snapshot.length) {
		await tx.insert(stockCountLine).values(
			snapshot.map((s) => ({
				orgId: input.orgId,
				countId: created.id,
				itemId: s.itemId,
				lotId: s.lotId,
				lotKey: s.lotId ?? 0,
				expected: s.quantity
			}))
		);
	}
	return created.id;
}

/** The count's lines with names, units and the value of each difference at average cost. */
export async function countLines(orgId: number, countId: number, reader: Writer = db) {
	const rows = await reader
		.select({
			id: stockCountLine.id,
			itemId: stockCountLine.itemId,
			item: item.name,
			sku: item.sku,
			category: category.name,
			unit: uom.symbol,
			lotId: stockCountLine.lotId,
			lotNumber: lot.lotNumber,
			expiryDate: lot.expiryDate,
			expected: stockCountLine.expected,
			counted: stockCountLine.counted,
			added: stockCountLine.addedDuringCount,
			note: stockCountLine.note,
			avgCost: item.avgCost
		})
		.from(stockCountLine)
		.innerJoin(item, eq(item.id, stockCountLine.itemId))
		.innerJoin(uom, eq(uom.id, item.baseUomId))
		.leftJoin(category, eq(category.id, item.categoryId))
		.leftJoin(lot, eq(lot.id, stockCountLine.lotId))
		.where(and(eq(stockCountLine.orgId, orgId), eq(stockCountLine.countId, countId)))
		.orderBy(asc(item.name), sql`${lot.expiryDate} IS NULL`, asc(lot.expiryDate));

	return rows.map((r) => {
		const variance = r.counted === null ? null : round4(r.counted - r.expected);
		return {
			...r,
			variance,
			varianceValue: variance === null ? null : Math.round(variance * r.avgCost * 100) / 100
		};
	});
}

/** Saves counted quantities. Blank means not counted yet. */
export async function saveCounts(
	tx: Tx,
	orgId: number,
	countId: number,
	entries: { lineId: number; counted: number | null }[],
	userId?: string
) {
	const count = await orgCount(orgId, countId, tx);
	if (count.status !== 'open') throw new StockError(`This count is ${count.status}.`);

	for (const e of entries) {
		if (e.counted !== null && (!Number.isFinite(e.counted) || e.counted < 0)) {
			throw new StockError('Counted quantities must be zero or more.');
		}
		await tx
			.update(stockCountLine)
			.set({ counted: e.counted === null ? null : round4(e.counted), countedBy: userId ?? null })
			.where(
				and(
					eq(stockCountLine.id, e.lineId),
					eq(stockCountLine.countId, countId),
					eq(stockCountLine.orgId, orgId)
				)
			);
	}
}

/** Something found on the shelf that the snapshot did not expect. */
export async function addFoundLine(
	tx: Tx,
	input: { orgId: number; countId: number; itemId: number; lotId: number | null; counted: number }
) {
	const count = await orgCount(input.orgId, input.countId, tx);
	if (count.status !== 'open') throw new StockError(`This count is ${count.status}.`);

	const [it] = await tx
		.select()
		.from(item)
		.where(and(eq(item.id, input.itemId), eq(item.orgId, input.orgId), isNull(item.deletedAt)));
	if (!it || !it.stockTracked) throw new StockError('Choose a stock item from the list.');
	if (it.trackSerials) throw new StockError(`${it.name} is counted by serial number, not here.`);
	if (it.trackLots && !input.lotId)
		throw new StockError(`Choose which lot of ${it.name} was found.`);
	if (input.lotId) {
		const [l] = await tx
			.select()
			.from(lot)
			.where(and(eq(lot.id, input.lotId), eq(lot.itemId, it.id)));
		if (!l) throw new StockError('That lot is not of this item.');
	}

	const lotKey = input.lotId ?? 0;
	const [existing] = await tx
		.select({ id: stockCountLine.id })
		.from(stockCountLine)
		.where(
			and(
				eq(stockCountLine.countId, input.countId),
				eq(stockCountLine.itemId, it.id),
				eq(stockCountLine.lotKey, lotKey)
			)
		);
	if (existing)
		throw new StockError(`${it.name} is already on this count; enter the quantity on its line.`);

	await tx.insert(stockCountLine).values({
		orgId: input.orgId,
		countId: input.countId,
		itemId: it.id,
		lotId: input.lotId,
		lotKey,
		expected: 0,
		counted: input.counted,
		addedDuringCount: true
	});
}

/**
 * How much stock of the counted items moved at the location after the count was opened. Posting
 * applies the differences found against the snapshot, so movements in between are worth a warning.
 */
export async function movedSinceOpened(orgId: number, countId: number) {
	const count = await orgCount(orgId, countId);
	const [row] = await db
		.select({ n: sql<number>`COUNT(*)` })
		.from(stockMovement)
		.where(
			and(
				eq(stockMovement.orgId, orgId),
				eq(stockMovement.locationId, count.locationId),
				sql`${stockMovement.createdAt} > ${count.createdAt}`,
				inArray(
					stockMovement.itemId,
					db
						.select({ id: stockCountLine.itemId })
						.from(stockCountLine)
						.where(eq(stockCountLine.countId, countId))
				)
			)
		);
	return Number(row.n);
}

/**
 * Posts the count: every difference becomes a line of one stock adjustment, posted in the same
 * transaction. A count that found nothing wrong is posted with no adjustment at all.
 */
export async function postCount(
	tx: Tx,
	input: { orgId: number; countId: number; userId?: string; today?: string }
): Promise<{ adjustmentId: number | null; number: string | null; lines: number }> {
	const { orgId, countId, userId } = input;
	const count = await orgCount(orgId, countId, tx);
	if (count.status !== 'open') throw new StockError(`This count is ${count.status}.`);

	const lines = await countLines(orgId, countId, tx);
	const uncounted = lines.filter((l) => l.counted === null).length;
	if (uncounted) {
		throw new StockError(
			`${uncounted} line${uncounted === 1 ? ' has' : 's have'} not been counted yet. Enter 0 for anything not on the shelf.`
		);
	}

	const differences = lines.filter((l) => l.variance !== 0);
	let adjustmentId: number | null = null;
	let number: string | null = null;

	if (differences.length) {
		const [doc] = await tx
			.insert(stockDocument)
			.values({
				orgId,
				type: 'adjustment',
				branchId: count.branchId,
				docDate: count.countDate,
				fromLocationId: count.locationId,
				reason: 'count',
				reference: `Count #${count.id}`,
				note: count.note,
				createdBy: userId
			})
			.$returningId();
		adjustmentId = doc.id;

		const baseUnits = new Map(
			(
				await tx
					.select({ id: item.id, baseUomId: item.baseUomId })
					.from(item)
					.where(inArray(item.id, [...new Set(differences.map((d) => d.itemId))]))
			).map((i) => [i.id, i.baseUomId])
		);

		for (const d of differences) {
			await tx.insert(stockDocumentLine).values({
				orgId,
				documentId: doc.id,
				itemId: d.itemId,
				uomId: baseUnits.get(d.itemId)!,
				quantity: d.variance!,
				// Short: taken out of the very lot that was short. Over: back into it by number, so the
				// posting service finds the same lot rather than making a new one.
				lotId: d.variance! < 0 ? d.lotId : null,
				lotNumber: d.variance! > 0 ? d.lotNumber : null,
				expiryDate: d.variance! > 0 ? d.expiryDate : null,
				note: d.added ? 'Found during count' : null
			});
		}

		({ number } = await postDocument(tx, {
			orgId,
			documentId: doc.id,
			userId,
			today: input.today ?? localToday()
		}));
	}

	await tx
		.update(stockCount)
		.set({ status: 'posted', adjustmentId, postedAt: new Date(), postedBy: userId ?? null })
		.where(eq(stockCount.id, count.id));

	return { adjustmentId, number, lines: differences.length };
}
