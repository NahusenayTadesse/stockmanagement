import { message, superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { env } from '$env/dynamic/private';
import { db } from '$lib/server/db';
import { contactMessage } from '$lib/server/db/schema';
import { sendMail } from '$lib/server/mail';
import { invalidForm } from '$lib/server/actions';
import { contactSchema } from '$lib/schemas/site';
import { getLocale } from '$lib/paraglide/runtime';
import { m } from '$lib/paraglide/messages.js';
import type { Actions, PageServerLoad } from './$types';

/**
 * At most this many messages from one address in the window. The form is open to anyone, and
 * every message is a row a person has to read — and, with `SITE_CONTACT_EMAIL` set, an email.
 * Kept in memory: a restart forgets it, which costs nothing.
 */
const LIMIT = 5;
const WINDOW_MS = 15 * 60_000;
const sent = new Map<string, number[]>();

function overLimit(address: string): boolean {
	const now = Date.now();
	const recent = (sent.get(address) ?? []).filter((at) => now - at < WINDOW_MS);
	if (recent.length >= LIMIT) {
		sent.set(address, recent);
		return true;
	}
	sent.set(address, [...recent, now]);
	// The map never grows past the addresses active in the last window.
	if (sent.size > 5000) {
		for (const [key, times] of sent) {
			if (!times.some((at) => now - at < WINDOW_MS)) sent.delete(key);
		}
	}
	return false;
}

export const load: PageServerLoad = async ({ locals }) => ({
	// A signed-in visitor does not retype who they are.
	form: await superValidate(
		locals.user ? { name: locals.user.name, email: locals.user.email } : {},
		zod4(contactSchema),
		{ errors: false }
	)
});

export const actions: Actions = {
	send: async (event) => {
		const form = await superValidate(event.request, zod4(contactSchema));
		if (!form.valid) return invalidForm(form);

		const { website, ...values } = form.data;
		const thanks = { type: 'success' as const, text: m.site_contact_sent() };

		// The trap field was filled in: a script. It is told what a person would be told.
		if (website) return message(form, thanks);

		if (overLimit(event.getClientAddress())) {
			return message(form, { type: 'error', text: m.site_contact_too_many() }, { status: 429 });
		}

		await db.insert(contactMessage).values({
			name: values.name,
			email: values.email,
			phone: values.phone || null,
			company: values.company || null,
			subject: values.subject,
			message: values.message,
			locale: getLocale(),
			// From here rather than the column's default, which is the database server's local time.
			createdAt: new Date()
		});

		// Forwarded when an inbox is configured; the site admin lists it either way.
		void sendMail(env.SITE_CONTACT_EMAIL?.trim(), {
			subject: `Contact: ${values.subject}`,
			heading: values.subject,
			body: [
				`${values.name} <${values.email}>${values.phone ? ` · ${values.phone}` : ''}${
					values.company ? ` · ${values.company}` : ''
				}`,
				...values.message.split(/\n{2,}/)
			]
		});

		return message(form, thanks);
	}
};
