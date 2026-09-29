import { paymentMethod } from '$lib/server/db/schema';
import { orgCrud } from '$lib/server/tenant';
import { add, edit } from './schema';
import { m } from '$lib/paraglide/messages.js';

const crud = orgCrud({
	table: paymentMethod,
	label: () => m.common_rec_payment_method(),
	addSchema: add,
	editSchema: edit,
	permission: 'settings.manage',
	audit: 'payment_method'
});

export const load = crud.load;
export const actions = crud.actions;
