import { eq } from 'drizzle-orm';
import { localToday } from '@nahu/admin-kit/time';
import { db } from '$lib/server/db';
import { organization } from '$lib/server/db/schema';
import { orgIdOf } from '$lib/server/tenant';
import { orgCustomer } from '$lib/server/customers';
import { customerStatement } from '$lib/server/credit';
import type { PageServerLoad } from './$types';

const isDay = (v: string | null): v is string => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);

/** The customer's account on paper: `?from=YYYY-MM-DD` starts it with a balance brought forward. */
export const load: PageServerLoad = async ({ params, locals, url }) => {
	const orgId = orgIdOf(locals);
	const c = await orgCustomer(orgId, Number(params.id));
	const from = url.searchParams.get('from');
	const today = localToday();
	const [statement, [org]] = await Promise.all([
		customerStatement(orgId, c.id, { today, from: isDay(from) ? from : undefined }),
		db
			.select({
				name: organization.name,
				tin: organization.tin,
				phone: organization.phone,
				address: organization.address,
				logo: organization.logo
			})
			.from(organization)
			.where(eq(organization.id, orgId))
	]);
	return { customer: c, statement, org, today, from: isDay(from) ? from : null };
};
