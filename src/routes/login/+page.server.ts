import { message, superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { redirect } from 'sveltekit-flash-message/server';

import { eq } from 'drizzle-orm';
import { auth } from '$lib/server/auth';
import { db } from '$lib/server/db';
import { user } from '$lib/server/db/schema';
import { loginSchema } from '$lib/schemas/auth';
import type { Actions, PageServerLoad } from './$types';
import { m } from '$lib/paraglide/messages.js';
import { invalidForm } from '$lib/server/actions';

/** Where someone lands when they did not ask for a page: the site admin's console, or the business. */
const homeOf = (siteAdmin: boolean) => (siteAdmin ? '/admin' : '/dashboard');

export const load: PageServerLoad = async (event) => {
	if (event.locals.user) redirect(302, homeOf(event.locals.siteAdmin));
	return { form: await superValidate(zod4(loginSchema)) };
};

export const actions: Actions = {
	login: async (event) => {
		const form = await superValidate(event.request, zod4(loginSchema));
		if (!form.valid) return invalidForm(form);

		try {
			await auth.api.signInEmail({
				body: { email: form.data.email, password: form.data.password },
				headers: event.request.headers
			});
		} catch {
			// The same words for an unknown email, a wrong password and an inactive account, so the
			// form cannot be used to find out which emails have accounts.
			return message(form, { type: 'error', text: m.admin_login_failed() }, { status: 401 });
		}

		// Read from the row: `locals` was filled before this request had a session.
		const [account] = await db
			.select({ siteAdmin: user.siteAdmin })
			.from(user)
			.where(eq(user.email, form.data.email));
		const siteAdmin = Boolean(account?.siteAdmin);

		// Same-origin paths only: `//evil.com` and `/\evil.com` both start with a slash.
		const redirectTo = event.url.searchParams.get('redirectTo');
		const safe = redirectTo && /^\/(?![/\\])/.test(redirectTo) ? redirectTo : homeOf(siteAdmin);

		redirect(safe, { type: 'success', message: m.admin_login_signed_in() }, event.cookies);
	}
};
