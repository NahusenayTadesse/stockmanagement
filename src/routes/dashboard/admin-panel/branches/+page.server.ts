import { branch } from '$lib/server/db/schema';
import { orgCrud } from '$lib/server/tenant';
import { add, edit } from './schema';
import { m } from '$lib/paraglide/messages.js';

const crud = orgCrud({
	table: branch,
	label: () => m.common_rec_branch(),
	addSchema: add,
	editSchema: edit,
	permission: 'settings.manage',
	audit: 'branch'
});

export const load = crud.load;
export const actions = crud.actions;
