/**
 * Expiry follow-up: what has expired or is about to, where it sits, and the two things to do about
 * it — move it into quarantine so nobody sells it, or write it off. Both are drafted as ordinary
 * stock documents for someone with posting rights to check and post.
 */
import { and, asc, eq, gt, inArray, isNull, sql } from 'drizzle-orm';
import { addLocalDays } from '@nahu/admin-kit/time';
import { formatETB } from '@nahu/admin-kit/global';
import { db } from '$lib/server/db';
import { qualified } from '$lib/server/db/sql';
import {
	branch,
	category,
	item,
	location,
	lot,
	organization,
	stockBalance,
	stockDocument,
	stockDocumentLine,
	uom,
	user
} from '$lib/server/db/schema';
import { StockError, type Tx } from '$lib/server/stock/post';
import { loadGrant } from '$lib/server/permissions';
import { sendMail } from '$lib/server/mail';

export type ExpiryBand = 'expired' | 'soon' | 'later';

/** A draft that already moves this lot, so the same stock is not drafted twice. */
const pendingDraft = sql<number | null>`(
	SELECT MIN(${stockDocument.id}) FROM ${stockDocument}
	JOIN ${stockDocumentLine} ON ${stockDocumentLine.documentId} = ${stockDocument.id}
	WHERE ${stockDocumentLine.lotId} = ${qualified(stockBalance, stockBalance.lotId)}
		AND ${stockDocument.status} = 'draft' AND ${stockDocumentLine.deletedAt} IS NULL
		AND ${stockDocument.fromLocationId} = ${qualified(stockBalance, stockBalance.locationId)}
)`;

/**
 * Stock of every lot that has expired or will within its category's warning period, one row per
 * lot and location. "Soon" is within 30 days.
 */
export async function expiryWatch(
	orgId: number,
	today: string,
	reader: Pick<typeof db, 'select'> = db
) {
	const rows = await reader
		.select({
			lotId: lot.id,
			lotNumber: lot.lotNumber,
			expiryDate: lot.expiryDate,
			lotStatus: lot.status,
			itemId: item.id,
			item: item.name,
			sku: item.sku,
			category: category.name,
			unit: uom.symbol,
			locationId: location.id,
			location: location.name,
			locationKind: location.kind,
			branchId: location.branchId,
			branch: branch.name,
			quantity: stockBalance.quantity,
			value: sql<number>`ROUND(${stockBalance.quantity} * ${item.avgCost}, 2)`,
			draftId: pendingDraft
		})
		.from(stockBalance)
		.innerJoin(lot, eq(lot.id, stockBalance.lotId))
		.innerJoin(item, eq(item.id, stockBalance.itemId))
		.innerJoin(uom, eq(uom.id, item.baseUomId))
		.innerJoin(location, eq(location.id, stockBalance.locationId))
		.innerJoin(branch, eq(branch.id, location.branchId))
		.leftJoin(category, eq(category.id, item.categoryId))
		.where(
			and(
				eq(stockBalance.orgId, orgId),
				gt(stockBalance.quantity, 0),
				sql`${lot.expiryDate} IS NOT NULL`,
				sql`${lot.expiryDate} <= DATE_ADD(${today}, INTERVAL COALESCE(${category.expiryWarningDays}, 90) DAY)`
			)
		)
		.orderBy(asc(lot.expiryDate), asc(item.name), asc(location.name));

	const soon = addLocalDays(today, 30);
	return rows.map((r) => {
		const expiry = r.expiryDate!;
		const band: ExpiryBand = expiry < today ? 'expired' : expiry <= soon ? 'soon' : 'later';
		const days = Math.round(
			(new Date(`${expiry}T00:00:00Z`).getTime() - new Date(`${today}T00:00:00Z`).getTime()) /
				86_400_000
		);
		return {
			...r,
			value: Number(r.value),
			band,
			days,
			draftId: r.draftId ? Number(r.draftId) : null
		};
	});
}

export type FollowUp = 'quarantine' | 'writeoff';

/**
 * Drafts the follow-up for the chosen lot-and-location pairs: one transfer into quarantine per
 * location (to the quarantine location of the same branch), or one write-off per location with
 * reason "expiry". The whole balance of each pair is moved. Returns the drafts' ids.
 */
export async function draftFollowUp(
	tx: Tx,
	input: {
		orgId: number;
		action: FollowUp;
		picks: { lotId: number; locationId: number }[];
		date: string;
		userId?: string;
	}
): Promise<number[]> {
	if (!input.picks.length) throw new StockError('Tick at least one lot.');

	const balances = await tx
		.select({
			itemId: stockBalance.itemId,
			lotId: stockBalance.lotId,
			locationId: stockBalance.locationId,
			quantity: stockBalance.quantity,
			baseUomId: item.baseUomId,
			trackSerials: item.trackSerials,
			item: item.name,
			locationKind: location.kind,
			branchId: location.branchId
		})
		.from(stockBalance)
		.innerJoin(item, eq(item.id, stockBalance.itemId))
		.innerJoin(location, eq(location.id, stockBalance.locationId))
		.where(
			and(
				eq(stockBalance.orgId, input.orgId),
				gt(stockBalance.quantity, 0),
				inArray(
					stockBalance.lotId,
					input.picks.map((p) => p.lotId)
				)
			)
		);

	const chosen = balances.filter((b) =>
		input.picks.some((p) => p.lotId === b.lotId && p.locationId === b.locationId)
	);
	if (!chosen.length) throw new StockError('None of those lots has stock left there any more.');

	const serial = chosen.find((b) => b.trackSerials);
	if (serial) {
		throw new StockError(
			`${serial.item} is tracked by serial number; draft its document by hand so the right units are named.`
		);
	}

	const quarantines =
		input.action === 'quarantine'
			? await tx
					.select({ id: location.id, branchId: location.branchId })
					.from(location)
					.where(
						and(
							eq(location.orgId, input.orgId),
							eq(location.kind, 'quarantine'),
							eq(location.status, true),
							isNull(location.deletedAt)
						)
					)
			: [];

	const byLocation = new Map<number, typeof chosen>();
	for (const b of chosen)
		byLocation.set(b.locationId, [...(byLocation.get(b.locationId) ?? []), b]);

	const ids: number[] = [];
	for (const [locationId, lines] of byLocation) {
		const { branchId, locationKind } = lines[0];
		let toLocationId: number | null = null;

		if (input.action === 'quarantine') {
			if (locationKind === 'quarantine') continue; // already where it should be
			const target = quarantines.find((q) => q.branchId === branchId) ?? quarantines[0] ?? null;
			if (!target) {
				throw new StockError(
					'There is no quarantine location. Add one (kind: Quarantine) under Admin panel → Locations first.'
				);
			}
			toLocationId = target.id;
		}

		const [doc] = await tx
			.insert(stockDocument)
			.values({
				orgId: input.orgId,
				type: input.action === 'quarantine' ? 'transfer' : 'adjustment',
				branchId,
				docDate: input.date,
				fromLocationId: locationId,
				toLocationId,
				reason: input.action === 'writeoff' ? 'expiry' : null,
				note:
					input.action === 'quarantine'
						? 'Expired or expiring stock moved out of sale.'
						: 'Expired stock written off.',
				createdBy: input.userId
			})
			.$returningId();

		await tx.insert(stockDocumentLine).values(
			lines.map((l) => ({
				orgId: input.orgId,
				documentId: doc.id,
				itemId: l.itemId,
				uomId: l.baseUomId,
				lotId: l.lotId,
				quantity: input.action === 'writeoff' ? -l.quantity : l.quantity
			}))
		);
		ids.push(doc.id);
	}

	if (!ids.length) throw new StockError('Those lots are already in quarantine.');
	return ids;
}

/** The digest as an email: expired stock first, then what expires within 30 days. */
export function digestContent(
	orgName: string,
	rows: Awaited<ReturnType<typeof expiryWatch>>,
	link: string
) {
	const urgent = rows.filter((r) => r.band !== 'later' && r.locationKind !== 'quarantine');
	const expired = urgent.filter((r) => r.band === 'expired');
	const soon = urgent.filter((r) => r.band === 'soon');
	const value = (list: typeof rows) => formatETB(list.reduce((s, r) => s + r.value, 0));

	return {
		subject: expired.length
			? `${expired.length} expired lot${expired.length === 1 ? '' : 's'} still in stock at ${orgName}`
			: `Expiring within 30 days at ${orgName}`,
		heading: 'Expiry follow-up',
		body: [
			expired.length
				? `${expired.length} lot${expired.length === 1 ? ' has' : 's have'} expired and ${expired.length === 1 ? 'is' : 'are'} still on the shelves (${value(expired)} at cost). Move ${expired.length === 1 ? 'it' : 'them'} to quarantine or write ${expired.length === 1 ? 'it' : 'them'} off.`
				: 'Nothing expired is outside quarantine.',
			soon.length
				? `${soon.length} more expire${soon.length === 1 ? 's' : ''} within 30 days (${value(soon)}).`
				: ''
		],
		table: urgent.length
			? {
					head: ['Item', 'Lot', 'Expiry', 'Where', 'Quantity'],
					rows: urgent
						.slice(0, 40)
						.map((r) => [
							r.item,
							r.lotNumber,
							r.band === 'expired' ? `${r.expiryDate} (expired)` : r.expiryDate!,
							r.location,
							`${r.quantity} ${r.unit}`
						])
				}
			: undefined,
		action: { label: 'Open expiry follow-up', url: link },
		footnote:
			urgent.length > 40 ? `Showing 40 of ${urgent.length}; the page has them all.` : undefined,
		urgent: urgent.length
	};
}

/**
 * The daily digest for every business with something urgent, to each active user who can post
 * stock documents (the people who can act on it). Returns how many emails went out.
 */
export async function sendExpiryDigests(today: string, origin: string) {
	const orgs = await db
		.select({ id: organization.id, name: organization.name })
		.from(organization)
		.where(eq(organization.isActive, true));

	let sent = 0;
	for (const org of orgs) {
		const content = digestContent(
			org.name,
			await expiryWatch(org.id, today),
			`${origin}/dashboard/stock/expiry`
		);
		if (!content.urgent) continue;

		const people = await db
			.select({ id: user.id, email: user.email })
			.from(user)
			.where(and(eq(user.orgId, org.id), eq(user.isActive, true), isNull(user.deletedAt)));
		for (const p of people) {
			const grant = await loadGrant(p.id);
			if (!grant.permList.includes('stock.post')) continue;
			if (await sendMail(p.email, content, org.name)) sent++;
		}
	}
	return sent;
}
