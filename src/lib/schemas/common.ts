/**
 * Field rules shared by the app's forms. Messages are functions, read when a form is checked,
 * so they are in the viewer's language.
 */
import { z } from 'zod/v4';
import { m } from '$lib/paraglide/messages.js';

/** A calendar day as the forms post it: Gregorian `YYYY-MM-DD` (the date inputs convert). */
export const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { error: () => m.common_pick_date() });

/** An optional day: empty or `YYYY-MM-DD`. */
export const optionalDay = z
	.string()
	.regex(/^(\d{4}-\d{2}-\d{2})?$/, { error: () => m.common_pick_date() })
	.default('');
