import { uom } from '$lib/server/db/schema';
import { orgCrud } from '$lib/server/tenant';
import { add, edit } from './schema';

const crud = orgCrud({
	table: uom,
	label: 'Unit',
	addSchema: add,
	editSchema: edit,
	permission: 'settings.manage',
	audit: 'uom'
});

export const load = crud.load;
export const actions = crud.actions;
