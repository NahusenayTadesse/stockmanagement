import { eq } from 'drizzle-orm';
import { hasPermission, requirePermission } from '@nahu/admin-kit/server/permissions';
import { db } from '$lib/server/db';
import { organization } from '$lib/server/db/schema';
import { orgIdOf } from '$lib/server/tenant';
import { setGuideHidden } from '$lib/server/gettingStarted';
import { flashDone } from '$lib/server/actions';
import { m } from '$lib/paraglide/messages.js';
import type { Actions, PageServerLoad } from './$types';

/** Who runs the business: sees the getting-started guide, and may bring it back. */
const GUIDE_PERMISSION = 'business.manage';

export const load: PageServerLoad = async ({ locals }) => {
	if (!hasPermission(locals, GUIDE_PERMISSION)) return { guideHidden: null };
	const [org] = await db
		.select({ hiddenAt: organization.guideHiddenAt })
		.from(organization)
		.where(eq(organization.id, orgIdOf(locals)));
	return { guideHidden: Boolean(org?.hiddenAt) };
};

export const actions: Actions = {
	/** Brings the getting-started guide back to the Dashboard. */
	showGuide: async (event) => {
		requirePermission(event.locals, GUIDE_PERMISSION);
		await setGuideHidden(orgIdOf(event.locals), false);
		flashDone(event, m.help_guide_shown());
		return { done: true as const };
	}
};
