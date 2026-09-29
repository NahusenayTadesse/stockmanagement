import { eq } from 'drizzle-orm';
import { message, setError, superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { redirect } from 'sveltekit-flash-message/server';

import { auth } from '$lib/server/auth';
import { db } from '$lib/server/db';
import { organization, user } from '$lib/server/db/schema';
import { createOrganization } from '$lib/server/seedPermissions';
import { registerSchema } from '$lib/schemas/auth';
import type { Actions, PageServerLoad } from './$types';
import { m } from '$lib/paraglide/messages.js';
import { invalidForm } from '$lib/server/actions';

export const load: PageServerLoad = async (event) => {
	if (event.locals.user) redirect(302, '/dashboard');
	return { form: await superValidate(zod4(registerSchema)) };
};

export const actions: Actions = {
	/**
	 * A new business and its owner, together. The owner gets the organization's owner role, which
	 * holds every permission; everyone else is added by them from the Users screen.
	 *
	 * The organization is made first, in a transaction, because the user row needs its id and role.
	 * If creating the account then fails, the organization is removed again rather than left
	 * behind with nobody able to sign in to it.
	 */
	register: async (event) => {
		const form = await superValidate(event.request, zod4(registerSchema));
		if (!form.valid) return invalidForm(form);

		const { business, tin, phone, name, email, password } = form.data;

		const [taken] = await db.select({ id: user.id }).from(user).where(eq(user.email, email));
		if (taken) {
			setError(form, 'email', m.admin_register_email_taken());
			return message(
				form,
				{ type: 'error', text: m.admin_register_email_taken() },
				{ status: 409 }
			);
		}

		const created = await db.transaction((tx) =>
			createOrganization(tx, { name: business, tin, phone })
		);

		try {
			// Through better-auth so the password is hashed the one way the system knows. Signs the
			// new owner in: the session cookie comes back through the SvelteKit cookies plugin.
			await auth.api.signUpEmail({
				body: {
					name,
					email,
					password,
					orgId: created.orgId,
					roleId: created.ownerRoleId,
					branchId: created.branchId
				},
				headers: event.request.headers
			});
		} catch (err) {
			console.error('registration failed', err);
			await db.delete(organization).where(eq(organization.id, created.orgId));
			return message(form, { type: 'error', text: m.admin_register_failed() }, { status: 500 });
		}

		redirect(
			'/dashboard',
			{ type: 'success', message: m.admin_register_welcome({ business }) },
			event.cookies
		);
	}
};
