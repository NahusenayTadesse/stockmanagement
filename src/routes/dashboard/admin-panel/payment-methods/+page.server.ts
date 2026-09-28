import { paymentMethod } from '$lib/server/db/schema';
import { orgCrud } from '$lib/server/tenant';
import { add, edit } from './schema';

const crud = orgCrud({
	table: paymentMethod,
	label: 'Payment method',
	addSchema: add,
	editSchema: edit,
	permission: 'settings.manage',
	audit: 'payment_method'
});

export const load = crud.load;
export const actions = crud.actions;
