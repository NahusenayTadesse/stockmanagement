import { fail } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { redirect, setFlash } from 'sveltekit-flash-message/server';
import { hasPermission, requirePermission } from '@nahu/admin-kit/server/permissions';
import { localToday } from '@nahu/admin-kit/time';
import { db } from '$lib/server/db';
import { organization } from '$lib/server/db/schema';
import { orgIdOf } from '$lib/server/tenant';
import { digestContent, draftFollowUp, expiryWatch, type FollowUp } from '$lib/server/expiry';
import { sendMail } from '$lib/server/mail';
import { StockError } from '$lib/server/stock/post';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const today = localToday();
	return {
		today,
		rows: await expiryWatch(orgIdOf(locals), today),
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

		let ids: number[];
		try {
			ids = await db.transaction((tx) =>
				draftFollowUp(tx, {
					orgId,
					action,
					picks,
					date: localToday(),
					userId: event.locals.user?.id
				})
			);
		} catch (err) {
			if (err instanceof StockError) {
				setFlash({ type: 'error', message: err.message }, event.cookies);
				return fail(409, { refused: err.message });
			}
			throw err;
		}

		const what = action === 'quarantine' ? 'transfer' : 'write-off';
		const text = `${ids.length} draft ${what}${ids.length === 1 ? '' : 's'} created — check and post ${ids.length === 1 ? 'it' : 'them'}`;
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
			await expiryWatch(orgId, localToday()),
			`${event.url.origin}/dashboard/stock/expiry`
		);
		const sent = await sendMail(email, content, org.name);
		setFlash(
			sent
				? { type: 'success', message: `Sent to ${email}` }
				: { type: 'error', message: 'The email could not be sent. Check the mail settings.' },
			event.cookies
		);
		return sent ? { sent: true } : fail(502);
	}
};
