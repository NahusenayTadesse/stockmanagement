/**
 * The getting-started guide on the Dashboard: the seven things a new business does before it is
 * really running, each ticked off from the business's own data rather than from anyone clicking
 * "done", so the guide cannot claim a step that has not happened.
 */
import { and, count, eq, isNotNull, isNull, or, sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import {
	item,
	organization,
	stockDocument,
	stockDocumentLine,
	stockMovement,
	subscription,
	subscriptionPayment,
	supplier,
	user
} from '$lib/server/db/schema';

/** The steps, in the order the guide lists them. Each names the tour that shows how. */
export const GUIDE_STEPS = [
	{ id: 'profile', tour: 'business' },
	{ id: 'items', tour: 'items' },
	{ id: 'suppliers', tour: 'suppliers' },
	{ id: 'stock', tour: 'documents' },
	{ id: 'sale', tour: 'pos' },
	{ id: 'staff', tour: 'users' },
	{ id: 'subscription', tour: 'subscription' }
] as const;
export type GuideStepId = (typeof GUIDE_STEPS)[number]['id'];

type Reader = Pick<typeof db, 'select'>;
type Writer = Pick<typeof db, 'update'>;

const any = async (query: Promise<{ n: number }[]>) => Number((await query)[0]?.n ?? 0) > 0;

/**
 * Which steps a business has done, and whether its owner put the guide away. Null when the guide
 * is hidden: nothing else is worth querying then.
 */
export async function gettingStarted(orgId: number, reader: Reader = db) {
	const [org] = await reader
		.select({
			address: organization.address,
			logo: organization.logo,
			hiddenAt: organization.guideHiddenAt,
			sells: organization.sellsToCustomers
		})
		.from(organization)
		.where(eq(organization.id, orgId));
	if (!org || org.hiddenAt) return null;

	const [items, suppliers, stock, sale, staff, paid] = await Promise.all([
		any(
			reader
				.select({ n: count() })
				.from(item)
				.where(and(eq(item.orgId, orgId), isNull(item.deletedAt)))
		),
		any(
			reader
				.select({ n: count() })
				.from(supplier)
				.where(and(eq(supplier.orgId, orgId), isNull(supplier.deletedAt)))
		),
		any(reader.select({ n: count() }).from(stockMovement).where(eq(stockMovement.orgId, orgId))),
		// A sale is a posted issue with priced lines, however it was made (the till, a proforma).
		any(
			reader
				.select({ n: count() })
				.from(stockDocumentLine)
				.innerJoin(stockDocument, eq(stockDocument.id, stockDocumentLine.documentId))
				.where(
					and(
						eq(stockDocument.orgId, orgId),
						eq(stockDocument.type, 'issue'),
						eq(stockDocument.status, 'posted'),
						org.sells ? isNotNull(stockDocumentLine.unitPrice) : undefined
					)
				)
		),
		reader
			.select({ n: count() })
			.from(user)
			.where(and(eq(user.orgId, orgId), isNull(user.deletedAt)))
			.then((rows) => Number(rows[0]?.n ?? 0) > 1),
		// Paid for, or given for free: either way there is nothing left to choose.
		any(
			reader
				.select({ n: count() })
				.from(subscription)
				.where(
					and(
						eq(subscription.orgId, orgId),
						or(
							eq(subscription.complimentary, true),
							sql`EXISTS (SELECT 1 FROM ${subscriptionPayment} WHERE ${subscriptionPayment.orgId} = ${orgId} AND ${subscriptionPayment.status} = 'paid')`
						)
					)
				)
		)
	]);

	const done: Record<GuideStepId, boolean> = {
		profile: Boolean(org.address?.trim() || org.logo),
		items,
		suppliers,
		stock,
		sale,
		staff,
		subscription: paid
	};

	const steps = GUIDE_STEPS.map((s) => ({ ...s, tour: s.id === 'sale' && !org.sells ? 'documents' : s.tour, done: done[s.id], ready: !['stock', 'sale'].includes(s.id) || (items && (s.id !== 'sale' || stock)) }));
	return { sells: org.sells, steps, completed: steps.filter((s) => s.done).length };
}
export type GettingStarted = NonNullable<Awaited<ReturnType<typeof gettingStarted>>>;

/** Puts the guide away for the whole business, or brings it back. */
export async function setGuideHidden(orgId: number, hidden: boolean, writer: Writer = db) {
	await writer
		.update(organization)
		.set({ guideHiddenAt: hidden ? new Date() : null })
		.where(eq(organization.id, orgId));
}
