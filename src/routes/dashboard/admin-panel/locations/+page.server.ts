import { branch, location } from '$lib/server/db/schema';
import { orgCrud, orgIdOf } from '$lib/server/tenant';
import { belongsToOrg, branchOptions } from '$lib/server/options';
import { add, edit } from './schema';
import type { PageServerLoad } from './$types';

const crud = orgCrud({
	table: location,
	label: 'Location',
	addSchema: add,
	editSchema: edit,
	permission: 'settings.manage',
	audit: 'location',
	transform: async (values, event) => {
		await belongsToOrg(branch, values.branchId, orgIdOf(event.locals), 'branchId', 'branch');
		return values;
	}
});

export const load: PageServerLoad = async (event) => {
	const [page, branchList] = await Promise.all([
		crud.load(event),
		branchOptions(orgIdOf(event.locals))
	]);
	// `childCrud` returns the table's own columns; the list shows the branch by name.
	const names = new Map(branchList.map((b) => [b.value, b.name]));
	return {
		...page,
		rows: (page.rows as (typeof location.$inferSelect)[]).map((row) => ({
			...row,
			branch: names.get(row.branchId) ?? '—'
		})),
		branchList
	};
};

export const actions = crud.actions;
