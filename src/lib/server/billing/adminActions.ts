/**
 * The site admin's form actions that more than one page offers: confirming and rejecting a
 * transfer receipt (the payments list, and a business's own page).
 */
import type { RequestEvent } from '@sveltejs/kit';
import { flashDone, refuseAction } from '$lib/server/actions';
import { rejectSchema } from '$lib/schemas/billing';
import { m } from '$lib/paraglide/messages.js';
import { confirmBankPayment, rejectBankPayment } from './payments';

/** The receipt matches money received: the payment counts and the subscription is extended. */
export async function confirmReceipt(event: RequestEvent) {
	const id = Number((await event.request.formData()).get('id'));
	if (!Number.isInteger(id) || id <= 0) return refuseAction(event, m.common_not_found(), 400);

	if (!(await confirmBankPayment(id, event.locals.user!.id))) {
		// Someone else decided it first, or it was replaced by a newer receipt.
		return refuseAction(event, m.platform_receipt_gone());
	}
	flashDone(event, m.platform_receipt_confirmed());
	return { done: true as const };
}

/** The receipt could not be matched. The reason is required: the business reads it. */
export async function rejectReceipt(event: RequestEvent) {
	const posted = Object.fromEntries(await event.request.formData());
	const parsed = rejectSchema.safeParse(posted);
	if (!parsed.success) return refuseAction(event, m.platform_v_reason(), 400);

	if (!(await rejectBankPayment(parsed.data.id, event.locals.user!.id, parsed.data.note))) {
		return refuseAction(event, m.platform_receipt_gone());
	}
	flashDone(event, m.platform_receipt_rejected());
	return { done: true as const };
}
