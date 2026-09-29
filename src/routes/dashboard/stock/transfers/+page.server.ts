import { and, desc, eq, gte, inArray, isNotNull, isNull, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/mysql-core';
import { addLocalDays, localToday } from '@nahu/admin-kit/time';
import { db } from '$lib/server/db';
import { qualified } from '$lib/server/db/sql';
import {
	branch,
	item,
	location,
	stockDocument,
	stockDocumentLine,
	uom,
	user
} from '$lib/server/db/schema';
import { orgIdOf } from '$lib/server/tenant';
import { branchScope, scopeWhere } from '$lib/server/scope';
import type { PageServerLoad } from './$types';

const fromLoc = alias(location, 'from_loc');
const toLoc = alias(location, 'to_loc');
const fromBranch = alias(branch, 'from_branch');
const toBranch = alias(branch, 'to_branch');
const receiver = alias(user, 'receiver');

/** Loss is looked for in transfers received this recently. */
const LOSS_DAYS = 90;

/**
 * Transfers between branches: what is on the road now, from or to the viewer's branches, and
 * recent ones that arrived short.
 */
export const load: PageServerLoad = async ({ locals }) => {
	const orgId = orgIdOf(locals);
	const scope = await branchScope(locals);
	const today = localToday();
	const since = addLocalDays(today, -LOSS_DAYS);

	const header = {
		id: stockDocument.id,
		number: stockDocument.number,
		docDate: stockDocument.docDate,
		from: sql<string>`CONCAT(${fromBranch.name}, ' · ', ${fromLoc.name})`,
		to: sql<string>`CONCAT(${toBranch.name}, ' · ', ${toLoc.name})`,
		driverName: stockDocument.driverName,
		vehiclePlate: stockDocument.vehiclePlate,
		sentBy: user.name
	};
	const inScope = scopeWhere(scope, fromLoc.branchId, toLoc.branchId);
	const lineCount = sql<number>`(
		SELECT COUNT(*) FROM ${stockDocumentLine}
		WHERE ${stockDocumentLine.documentId} = ${qualified(stockDocument, stockDocument.id)}
			AND ${stockDocumentLine.deletedAt} IS NULL
	)`;

	const [onTheRoad, received] = await Promise.all([
		db
			.select({ ...header, lines: lineCount })
			.from(stockDocument)
			.innerJoin(fromLoc, eq(fromLoc.id, stockDocument.fromLocationId))
			.innerJoin(toLoc, eq(toLoc.id, stockDocument.toLocationId))
			.innerJoin(fromBranch, eq(fromBranch.id, fromLoc.branchId))
			.innerJoin(toBranch, eq(toBranch.id, toLoc.branchId))
			.leftJoin(user, eq(user.id, stockDocument.postedBy))
			.where(
				and(
					eq(stockDocument.orgId, orgId),
					eq(stockDocument.type, 'transfer'),
					eq(stockDocument.status, 'in_transit'),
					inScope
				)
			)
			.orderBy(stockDocument.docDate, stockDocument.id),
		db
			.select({
				...header,
				receivedAt: stockDocument.receivedAt,
				receivedBy: receiver.name
			})
			.from(stockDocument)
			.innerJoin(fromLoc, eq(fromLoc.id, stockDocument.fromLocationId))
			.innerJoin(toLoc, eq(toLoc.id, stockDocument.toLocationId))
			.innerJoin(fromBranch, eq(fromBranch.id, fromLoc.branchId))
			.innerJoin(toBranch, eq(toBranch.id, toLoc.branchId))
			.leftJoin(user, eq(user.id, stockDocument.postedBy))
			.leftJoin(receiver, eq(receiver.id, stockDocument.receivedBy))
			.where(
				and(
					eq(stockDocument.orgId, orgId),
					eq(stockDocument.type, 'transfer'),
					eq(stockDocument.status, 'posted'),
					isNotNull(stockDocument.receivedAt),
					gte(stockDocument.receivedAt, new Date(`${since}T00:00:00+03:00`)),
					inScope
				)
			)
			.orderBy(desc(stockDocument.receivedAt))
			.limit(500)
	]);

	// Of those received, the ones where something did not arrive.
	const shortLines = received.length
		? await db
				.select({
					documentId: stockDocumentLine.documentId,
					item: item.name,
					unit: uom.symbol,
					sent: stockDocumentLine.quantity,
					arrived: stockDocumentLine.receivedQuantity
				})
				.from(stockDocumentLine)
				.innerJoin(item, eq(item.id, stockDocumentLine.itemId))
				.innerJoin(uom, eq(uom.id, stockDocumentLine.uomId))
				.where(
					and(
						inArray(
							stockDocumentLine.documentId,
							received.map((r) => r.id)
						),
						isNull(stockDocumentLine.deletedAt),
						isNotNull(stockDocumentLine.receivedQuantity),
						sql`${stockDocumentLine.receivedQuantity} < ${stockDocumentLine.quantity}`
					)
				)
		: [];

	const days = (from: string) =>
		Math.max(0, Math.round((Date.parse(today) - Date.parse(from)) / 86_400_000));

	return {
		onTheRoad: onTheRoad.map((t) => ({
			...t,
			lines: Number(t.lines),
			days: days(t.docDate)
		})),
		short: received
			.map((r) => {
				const lost = shortLines.filter((l) => l.documentId === r.id);
				return {
					...r,
					lost: lost
						.map(
							(l) =>
								`${l.item}: ${Math.round((l.sent - (l.arrived ?? 0)) * 10000) / 10000} ${l.unit} of ${l.sent}`
						)
						.join('; '),
					lostLines: lost.length
				};
			})
			.filter((r) => r.lostLines > 0),
		lossDays: LOSS_DAYS
	};
};
