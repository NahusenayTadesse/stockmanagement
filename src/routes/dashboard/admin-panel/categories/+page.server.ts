import { category } from '$lib/server/db/schema';
import { orgCrud } from '$lib/server/tenant';
import { add, edit } from './schema';

const crud = orgCrud({
	table: category,
	label: 'Category',
	addSchema: add,
	editSchema: edit,
	permission: 'settings.manage',
	audit: 'category'
});

export const load = crud.load;
export const actions = crud.actions;
