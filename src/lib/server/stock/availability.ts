import { and, eq, gt } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { stockBalance, lot } from '$lib/server/db/schema';
import { reservedByLocation } from '$lib/server/reservations';
import { allocate, type Candidate } from './math';
import { round4 } from '$lib/money';

/** The same FEFO eligibility and reservations as posting; checkout still locks and rechecks. */
export async function availabilityAt(orgId: number, locationId: number, today: string, reader: Pick<typeof db, 'select'> = db) {
	const [rows, held] = await Promise.all([
		reader.select({ itemId: stockBalance.itemId, lotId: stockBalance.lotId, quantity: stockBalance.quantity, expiryDate: lot.expiryDate, status: lot.status })
			.from(stockBalance).leftJoin(lot, eq(lot.id, stockBalance.lotId))
			.where(and(eq(stockBalance.orgId, orgId), eq(stockBalance.locationId, locationId), gt(stockBalance.quantity, 0))),
		reservedByLocation(orgId, today, reader)
	]);
	const grouped = new Map<number, Candidate[]>();
	for (const row of rows) grouped.set(row.itemId, [...(grouped.get(row.itemId) ?? []), row]);
	return new Map([...grouped].map(([id, lots]) => {
		const usable = allocate(lots, Number.MAX_SAFE_INTEGER, { today }).takes.reduce((sum, t) => sum + t.quantity, 0);
		const reserved = held.get(`${locationId}:${id}`) ?? 0;
		return [id, { onHand: round4(lots.reduce((sum, l) => sum + l.quantity, 0)), reserved, sellable: Math.max(0, round4(usable - reserved)) }];
	}));
}
