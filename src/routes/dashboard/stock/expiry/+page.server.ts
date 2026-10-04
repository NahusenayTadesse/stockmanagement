import { m } from '$lib/paraglide/messages.js';
import { fail } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { redirect, setFlash } from 'sveltekit-flash-message/server';
import { hasPermission, requirePermission } from '@nahu/admin-kit/server/permissions';
import { localToday } from '@nahu/admin-kit/time';
import { db } from '$lib/server/db';
import { organization } from '$lib/server/db/schema';
import { branchScope, viewScope } from '$lib/server/scope';
import { orgIdOf } from '$lib/server/tenant';
import { digestContent, draftFollowUp, expiryWatch, type FollowUp } from '$lib/server/expiry';
import { sendMail } from '$lib/server/mail';
import { attempt } from '$lib/server/actions';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	const today = localToday();
	return {
		today,
		rows: (await expiryWatch(orgIdOf(locals), today, db, await viewScope(locals, url))).filter((r) => url.searchParams.get('status') === 'expired' ? r.band === 'expired' : url.searchParams.get('status') === 'soon' ? r.band !== 'expired' : true),
		canDraft: hasPermission(locals, 'stock.draft')
	};
};

export const actions: Actions = {
	/** Drafts a transfer into quarantine, or a write-off, for the ticked rows. */
	draft: async (event) => {
		requirePermission(event.locals, 'stock.draft');
		const orgId = orgIdOf(event.locals);
		const form = await event.request.formData();
		const action = form.get('action') as FollowUp;
		if (action !== 'quarantine' && action !== 'writeoff') return fail(400);
		const picks = form
			.getAll('pick')
			.map(String)
			.map((v) => v.split(':').map(Number))
			.filter(([lotId, locationId]) => Number.isInteger(lotId) && Number.isInteger(locationId))
			.map(([lotId, locationId]) => ({ lotId, locationId }));

		const scope = await branchScope(event.locals);
		let ids = null as number[] | null;
		const answer = await attempt(event, async () => {
			ids = await db.transaction((tx) =>
				draftFollowUp(tx, {
					orgId,
					action,
					picks,
					scope,
					date: localToday(),
					userId: event.locals.user?.id
				})
			);
			return null;
		});
		if (!ids) return answer;

		const one = ids.length === 1;
		const text =
			action === 'quarantine'
				? one
					? m.stock_drafts_transfer_one()
					: m.stock_drafts_transfer_many({ count: ids.length })
				: one
					? m.stock_drafts_writeoff_one()
					: m.stock_drafts_writeoff_many({ count: ids.length });
		redirect(
			ids.length === 1 ? `/dashboard/stock/documents/${ids[0]}` : '/dashboard/stock/documents',
			{ type: 'success', message: text },
			event.cookies
		);
	},

	/** The digest, now, to the person asking. */
	emailMe: async (event) => {
		const orgId = orgIdOf(event.locals);
		const email = event.locals.user?.email;
		if (!email) return fail(401);
		const [org] = await db
			.select({ name: organization.name })
			.from(organization)
			.where(eq(organization.id, orgId));
		const content = digestContent(
			org.name,
			await expiryWatch(orgId, localToday(), db, await branchScope(event.locals)),
			`${event.url.origin}/dashboard/stock/expiry`
		);
		const sent = await sendMail(email, content, org.name);
		setFlash(
			sent
				? { type: 'success', message: m.stock_sent_to({ email }) }
				: { type: 'error', message: m.stock_email_failed() },
			event.cookies
		);
		return sent ? { sent: true } : fail(502);
	}
};
