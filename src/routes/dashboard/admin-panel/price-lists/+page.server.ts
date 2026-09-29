import { priceList } from '$lib/server/db/schema';
import { orgCrud } from '$lib/server/tenant';
import { add, edit } from './schema';

const crud = orgCrud({
	table: priceList,
	label: 'Price list',
	addSchema: add,
	editSchema: edit,
	permission: 'settings.manage',
	audit: 'price_list',
	transform: (values) => ({ ...values, note: values.note || null })
});

export const load = crud.load;
export const actions = crud.actions;
