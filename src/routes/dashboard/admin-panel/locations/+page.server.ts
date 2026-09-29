import { fail } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { setFlash } from 'sveltekit-flash-message/server';
import { WriteRefused } from '@nahu/admin-kit/server/childCrud';
import { db } from '$lib/server/db';
import { branch, location } from '$lib/server/db/schema';
import { orgCrud, orgIdOf } from '$lib/server/tenant';
import { belongsToOrg, branchOptions } from '$lib/server/options';
import { add, edit } from './schema';
import type { Actions, PageServerLoad, RequestEvent } from './$types';

/**
 * Transit locations are made by the system, one per branch, to hold transfers on the road. They
 * are not listed here and cannot be changed or deleted: stock in them moves only by being received.
 */
const TRANSIT = 'That location is where transfers wait on the road; the system keeps it.';

const crud = orgCrud({
	table: location,
	label: 'Location',
	addSchema: add,
	editSchema: edit,
	permission: 'settings.manage',
	audit: 'location',
	transform: async (values, event, before) => {
		if ((before as typeof location.$inferSelect | undefined)?.kind === 'transit') {
			throw new WriteRefused('name', TRANSIT);
		}
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
		rows: (page.rows as (typeof location.$inferSelect)[])
			.filter((row) => row.kind !== 'transit')
			.map((row) => ({
				...row,
				branch: names.get(row.branchId) ?? '—'
			})),
		branchList
	};
};

async function isTransit(event: RequestEvent) {
	const data = await event.request.clone().formData();
	const id = Number(data.get('id'));
	if (!id) return false;
	const [row] = await db
		.select({ kind: location.kind })
		.from(location)
		.where(and(eq(location.id, id), eq(location.orgId, orgIdOf(event.locals))));
	return row?.kind === 'transit';
}

export const actions: Actions = {
	add: crud.actions.add,
	edit: crud.actions.edit,
	delete: async (event) => {
		if (await isTransit(event)) {
			setFlash({ type: 'error', message: TRANSIT }, event.cookies);
			return fail(409, { refused: TRANSIT });
		}
		return crud.actions.delete(event);
	}
};
