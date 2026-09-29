import { message, setError, superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { redirect } from 'sveltekit-flash-message/server';
import { auth } from '$lib/server/auth';
import { resetSchema } from '$lib/schemas/auth';
import type { Actions, PageServerLoad } from './$types';
import { m } from '$lib/paraglide/messages.js';
import { invalidForm } from '$lib/server/actions';

/**
 * Where the emailed link lands. better-auth checks the token first (at
 * /api/auth/reset-password/:token) and forwards here with `?token=`, or with `?error=` when the link
 * is expired or already used.
 */
export const load: PageServerLoad = async ({ url }) => {
	const token = url.searchParams.get('token') ?? '';
	const invalid = Boolean(url.searchParams.get('error')) || !token;
	return {
		invalid,
		form: await superValidate({ token }, zod4(resetSchema), { errors: false })
	};
};

export const actions: Actions = {
	default: async (event) => {
		const form = await superValidate(event.request, zod4(resetSchema));
		if (!form.valid) return invalidForm(form);

		try {
			await auth.api.resetPassword({
				body: { newPassword: form.data.password, token: form.data.token },
				headers: event.request.headers
			});
		} catch {
			setError(form, 'password', m.admin_reset_invalid());
			return message(
				form,
				{
					type: 'error',
					text: m.admin_reset_invalid_ask()
				},
				{ status: 400 }
			);
		}

		redirect('/login', { type: 'success', message: m.admin_reset_done() }, event.cookies);
	}
};
