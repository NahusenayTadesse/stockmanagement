import { fail } from '@sveltejs/kit';
import { message, superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { redirect } from 'sveltekit-flash-message/server';
import { auth } from '$lib/server/auth';
import { forgotSchema } from '$lib/schemas/auth';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	if (locals.user) redirect(302, '/dashboard');
	return { form: await superValidate(zod4(forgotSchema)) };
};

export const actions: Actions = {
	default: async (event) => {
		const form = await superValidate(event.request, zod4(forgotSchema));
		if (!form.valid) return fail(400, { form });

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
			text: 'If that email has an account, a reset link is on its way. Check your inbox and spam folder.'
		});
	}
};
