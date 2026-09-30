import { and, eq } from 'drizzle-orm';
import { message, superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { db } from '$lib/server/db';
import { contactMessage } from '$lib/server/db/schema';
import { invalidForm } from '$lib/server/actions';
import { contactMessages } from '$lib/server/billing/admin';
import { handleMessageSchema } from '$lib/schemas/billing';
import { m } from '$lib/paraglide/messages.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const messages = await contactMessages();
	return {
		waiting: messages.filter((row) => row.status === 'new'),
		handled: messages.filter((row) => row.status === 'handled'),
		form: await superValidate(zod4(handleMessageSchema))
	};
};

export const actions: Actions = {
	/** Someone dealt with it: answered, called back, or decided it needs nothing. */
	handle: async ({ request, locals }) => {
		const form = await superValidate(request, zod4(handleMessageSchema));
		if (!form.valid) return invalidForm(form);

		await db
			.update(contactMessage)
			.set({
				status: 'handled',
				adminNote: form.data.adminNote || null,
				handledBy: locals.user!.id,
				handledAt: new Date()
			})
			.where(and(eq(contactMessage.id, form.data.id), eq(contactMessage.status, 'new')));
		return message(form, { type: 'success', text: m.platform_message_handled() });
	}
};
