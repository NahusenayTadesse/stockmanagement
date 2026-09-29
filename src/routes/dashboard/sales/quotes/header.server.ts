/**
 * A proforma's header as the new-proforma and edit forms both save it: the buyer and location
 * checked, and the columns it writes.
 */
import { and, eq, isNull } from 'drizzle-orm';
import type { z } from 'zod/v4';
import { WriteRefused } from '@nahu/admin-kit/server/childCrud';
import { db } from '$lib/server/db';
import { location } from '$lib/server/db/schema';
import { checkCustomer } from '$lib/server/customers';
import type { quoteHeader } from '$lib/schemas/quotes';
import { m } from '$lib/paraglide/messages.js';

type Header = z.infer<typeof quoteHeader>;

/**
 * Refuses a customer or location that is not this business's. Returns the branch of the chosen
 * location, or null when none is chosen.
 */
export async function checkHeader(orgId: number, data: Header): Promise<number | null> {
	if (data.customerId && !(await checkCustomer(orgId, data.customerId))) {
		throw new WriteRefused('customerId', m.sales_err_choose_customer());
	}
	if (!data.locationId) return null;
	const [loc] = await db
		.select({ branchId: location.branchId })
		.from(location)
		.where(
			and(eq(location.id, data.locationId), eq(location.orgId, orgId), isNull(location.deletedAt))
		);
	if (!loc) throw new WriteRefused('locationId', m.sales_err_choose_location());
	return loc.branchId;
}

/** The header's columns: a listed customer, or a one-off buyer's name. */
export function headerValues(data: Header) {
	return {
		customerId: data.customerId || null,
		buyerName: data.customerId ? null : data.buyerName || null,
		buyerTin: data.buyerTin || null,
		buyerPhone: data.buyerPhone || null,
		locationId: data.locationId || null,
		quoteDate: data.quoteDate,
		validUntil: data.validUntil || null,
		reference: data.reference || null,
		note: data.note || null,
		terms: data.terms || null
	};
}
