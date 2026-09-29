import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { branch, customer, organization } from '$lib/server/db/schema';
import { orgIdOf } from '$lib/server/tenant';
import { orgQuote, quoteLines } from '$lib/server/quotes';
import { amountInWords } from '$lib/server/salesDocs';
import type { PageServerLoad } from './$types';

/** The proforma invoice on paper. */
export const load: PageServerLoad = async ({ params, locals }) => {
	const orgId = orgIdOf(locals);
	const q = await orgQuote(orgId, Number(params.id));
	const [priced, [org], [br], [buyer]] = await Promise.all([
		quoteLines(orgId, q.id),
		db
			.select({
				name: organization.name,
				tin: organization.tin,
				logo: organization.logo,
				vatRegistered: organization.vatRegistered
			})
			.from(organization)
			.where(eq(organization.id, orgId)),
		db
			.select({ address: branch.address, phone: branch.phone })
			.from(branch)
			.where(eq(branch.id, q.branchId)),
		q.customerId
			? db
					.select({
						name: customer.name,
						tin: customer.tin,
						phone: customer.phone,
						address: customer.address
					})
					.from(customer)
					.where(eq(customer.id, q.customerId))
			: Promise.resolve([])
	]);
	return {
		quote: q,
		lines: priced.lines,
		totals: priced.totals,
		org,
		branch: br,
		buyer: buyer ?? { name: q.buyerName, tin: q.buyerTin, phone: q.buyerPhone, address: null },
		inWords: amountInWords(priced.totals.gross)
	};
};
