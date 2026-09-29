import { fail } from '@sveltejs/kit';
import { message, superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { auth } from '$lib/server/auth';
import { changePasswordSchema } from '$lib/schemas/users';
import type { Actions, PageServerLoad } from './$types';
import { m } from '$lib/paraglide/messages.js';

export const load: PageServerLoad = async () => ({
	form: await superValidate(zod4(changePasswordSchema))
});

export const actions: Actions = {
	changePassword: async (event) => {
		const form = await superValidate(event.request, zod4(changePasswordSchema));
		if (!form.valid) return fail(400, { form });

		try {
			await auth.api.changePassword({
				body: {
					currentPassword: form.data.currentPassword,
					newPassword: form.data.newPassword,
					// A password someone may have seen is not fixed while the session that saw it is open.
					revokeOtherSessions: true
				},
				headers: event.request.headers
			});
		} catch (err) {
			const code = (err as { body?: { code?: string } })?.body?.code;
			if (code === 'INVALID_PASSWORD') {
				return message(
					form,
					{ type: 'error', text: m.admin_change_wrong_current() },
					{ status: 400 }
				);
			}
			console.error('password change failed', err);
			return message(form, { type: 'error', text: m.admin_change_failed() }, { status: 500 });
		}

		return message(form, {
			type: 'success',
			text: m.admin_change_done()
		});
	}
};
