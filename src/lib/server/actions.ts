/**
 * How form actions answer, the same way everywhere: a refusal the person can act on (a
 * `StockError` from the stock code, a `WriteRefused` from a check) becomes a flash message and a
 * failure the page can read as `form.refused` (and `form.lineId`, for the line at fault);
 * anything else is a real error and is thrown. Success is a flash and `{ done: true }`.
 */
import { fail, type RequestEvent } from '@sveltejs/kit';
import { setFlash } from 'sveltekit-flash-message/server';
import { message, setError, type SuperValidated } from 'sveltekit-superforms';
import { WriteRefused } from '@nahu/admin-kit/server/childCrud';
import { StockError } from '$lib/server/stock/errors';
import { m } from '$lib/paraglide/messages.js';

/** What a refused action returns, for the page to show. */
export type Refusal = { refused: string; lineId: number | null };

/** The failure a refused action returns — nothing flashed, for pages that show it themselves. */
export function refusal(text: string, status = 409, lineId: number | null = null) {
	return fail(status, { refused: text, lineId } satisfies Refusal);
}

function refusalOf(err: unknown): { text: string; lineId: number | null; field?: string } | null {
	if (err instanceof StockError) return { text: err.message, lineId: err.lineId ?? null };
	if (err instanceof WriteRefused) {
		return { text: err.message, lineId: null, field: err.field ?? undefined };
	}
	return null;
}

/**
 * Runs an action's work. It returns the success message (flashed), or null to flash nothing.
 * A refusal is flashed and returned as `fail(status, { refused, lineId })`.
 */
export async function attempt(
	event: Pick<RequestEvent, 'cookies'>,
	work: () => Promise<string | null>,
	options: { status?: number } = {}
) {
	try {
		const text = await work();
		if (text) setFlash({ type: 'success', message: text }, event.cookies);
		return { done: true as const };
	} catch (err) {
		const refused = refusalOf(err);
		if (!refused) throw err;
		setFlash({ type: 'error', message: refused.text }, event.cookies);
		return refusal(refused.text, options.status ?? 409, refused.lineId);
	}
}

/**
 * The same for a superform: the refusal goes on the form (and on its field, when it names one
 * or `field` does), and success is the form's message.
 */
export async function attemptForm<T extends Record<string, unknown>>(
	form: SuperValidated<T>,
	work: () => Promise<string>,
	options: { field?: string; status?: number } = {}
) {
	try {
		return message(form, { type: 'success', text: await work() });
	} catch (err) {
		const refusal = refusalOf(err);
		if (!refusal) throw err;
		const field = refusal.field ?? options.field;
		if (field) setError(form, field as never, refusal.text);
		return message(
			form,
			{ type: 'error', text: refusal.text },
			{ status: (options.status ?? 400) as 400 }
		);
	}
}

/** A form that did not pass its schema. */
export function invalidForm<T extends Record<string, unknown>>(form: SuperValidated<T>) {
	return message(form, { type: 'error', text: m.common_check_form() }, { status: 400 });
}

/** A success flash, for actions that redirect or return their own data. */
export function flashDone(event: Pick<RequestEvent, 'cookies'>, text: string) {
	setFlash({ type: 'success', message: text }, event.cookies);
}

/**
 * Saying no without an exception: the refusal goes on the form (and under `field`, when it is
 * about one — with `fieldText` there, when that should differ from the message).
 */
export function refuseForm<T extends Record<string, unknown>>(
	form: SuperValidated<T>,
	text: string,
	options: { field?: string; fieldText?: string; status?: 400 | 403 | 409 | 500 } = {}
) {
	if (options.field) setError(form, options.field as never, options.fieldText ?? text);
	return message(form, { type: 'error', text }, { status: (options.status ?? 400) as 400 });
}

/** The same for an action without a form (a delete): flashed, and returned as `{ refused }`. */
export function refuseAction(event: Pick<RequestEvent, 'cookies'>, text: string, status = 409) {
	setFlash({ type: 'error', message: text }, event.cookies);
	return refusal(text, status);
}
