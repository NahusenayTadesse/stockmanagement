import { fail } from '@sveltejs/kit';
import { message, superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { redirect } from 'sveltekit-flash-message/server';

import { auth } from '$lib/server/auth';
import { loginSchema } from '$lib/schemas/auth';
import type { Actions, PageServerLoad } from './$types';
import { m } from '$lib/paraglide/messages.js';

export const load: PageServerLoad = async (event) => {
	if (event.locals.user) redirect(302, '/dashboard');
	return { form: await superValidate(zod4(loginSchema)) };
};

export const actions: Actions = {
	login: async (event) => {
		const form = await superValidate(event.request, zod4(loginSchema));
		if (!form.valid) return fail(400, { form });

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

		// Same-origin paths only: `//evil.com` and `/\evil.com` both start with a slash.
		const redirectTo = event.url.searchParams.get('redirectTo');
		const safe = redirectTo && /^\/(?![/\\])/.test(redirectTo) ? redirectTo : '/dashboard';

		redirect(safe, { type: 'success', message: m.admin_login_signed_in() }, event.cookies);
	}
};
