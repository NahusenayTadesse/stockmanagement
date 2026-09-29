import { message, superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { redirect } from 'sveltekit-flash-message/server';
import { auth } from '$lib/server/auth';
import { forgotSchema } from '$lib/schemas/auth';
import type { Actions, PageServerLoad } from './$types';
import { m } from '$lib/paraglide/messages.js';
import { invalidForm } from '$lib/server/actions';

export const load: PageServerLoad = async ({ locals }) => {
	if (locals.user) redirect(302, '/dashboard');
	return { form: await superValidate(zod4(forgotSchema)) };
};

export const actions: Actions = {
	default: async (event) => {
		const form = await superValidate(event.request, zod4(forgotSchema));
		if (!form.valid) return invalidForm(form);

		try {
			await auth.api.requestPasswordReset({
				body: { email: form.data.email, redirectTo: '/reset-password' },
				headers: event.request.headers
			});
		} catch (err) {
			// Rate limits and the like: logged, and the same answer as ever, so the form cannot be used
			// to find out which emails have accounts.
			console.error('password reset request failed', err);
		}

		return message(form, {
			type: 'success',
			text: m.admin_forgot_done()
		});
	}
};
