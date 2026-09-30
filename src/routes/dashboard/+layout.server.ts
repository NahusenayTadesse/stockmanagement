import { redirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { organization } from '$lib/server/db/schema';

export const load = async ({ locals, url }) => {
	if (!locals.user || !locals.orgId) {
		redirect(302, `/login?redirectTo=${encodeURIComponent(url.pathname + url.search)}`);
	}

	const [org] = await db
		.select({
			name: organization.name,
			logo: organization.logo,
			sellsToCustomers: organization.sellsToCustomers
		})
		.from(organization)
		.where(eq(organization.id, locals.orgId));

	return {
		permList: locals.permList,
		isSuperAdmin: locals.isSuperAdmin,
		user: { id: locals.user.id, name: locals.user.name, email: locals.user.email },
		organization: org,
		// For the banner: a trial running out, a payment due. Set by the gate in `hooks.server.ts`.
		subscription: locals.subscription,
		siteAdmin: locals.siteAdmin
	};
};
