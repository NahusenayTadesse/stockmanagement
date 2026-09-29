/**
 * The page side of manual texts: the permission, the business's switch, and a flash saying what
 * happened. Apart from `./sms` because that module is plain database code the seed can import.
 */
import { fail, type RequestEvent } from '@sveltejs/kit';
import { setFlash } from 'sveltekit-flash-message/server';
import { hasPermission, requirePermission } from '@nahu/admin-kit/server/permissions';
import { orgIdOf } from '$lib/server/tenant';
import { smsSettings, type SmsResult } from '$lib/server/sms';
import { m } from '$lib/paraglide/messages.js';

/** For a load: whether this person may text from this page (SMS on, and `sms.send`). */
export async function canText(locals: App.Locals) {
	if (!hasPermission(locals, 'sms.send') || !locals.orgId) return false;
	return Boolean((await smsSettings(locals.orgId))?.enabled);
}

/**
 * Runs a send and flashes its outcome. `what` names the message, in the viewer's language:
 * "Reminder", "Proforma"…
 */
export async function textAction(
	event: RequestEvent,
	what: string,
	send: (orgId: number, form: FormData) => Promise<SmsResult>
) {
	requirePermission(event.locals, 'sms.send');
	const orgId = orgIdOf(event.locals);
	const r = await send(orgId, await event.request.formData());
	setFlash(
		r.ok
			? {
					type: 'success',
					message:
						r.status === 'dry_run'
							? m.sales_sms_what_logged({ what })
							: m.sales_sms_what_sent({ what })
				}
			: {
					type: 'error',
					message: m.sales_sms_what_not_sent({ what, error: r.error ?? m.sales_unknown_error() })
				},
		event.cookies
	);
	return r.ok ? { texted: true } : fail(r.status === 'off' ? 409 : 400, { smsError: r.error });
}

/** The number typed on the form, or null to use the one on file. */
export const typedNumber = (form: FormData) => String(form.get('to') ?? '').trim() || null;
