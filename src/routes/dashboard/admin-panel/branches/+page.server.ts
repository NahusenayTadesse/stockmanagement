import { branch } from '$lib/server/db/schema';
import { orgCrud } from '$lib/server/tenant';
import { add, edit } from './schema';

const crud = orgCrud({
	table: branch,
	label: 'Branch',
	addSchema: add,
	editSchema: edit,
	permission: 'settings.manage',
	audit: 'branch'
});

export const load = crud.load;
export const actions = crud.actions;
