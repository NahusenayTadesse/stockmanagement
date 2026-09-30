import { branch } from '$lib/server/db/schema';
import { WriteRefused } from '@nahu/admin-kit/server/childCrud';
import { orgCrud, orgIdOf } from '$lib/server/tenant';
import { seatRefusal } from '$lib/server/billing/subscriptions';
import { add, edit } from './schema';
import { m } from '$lib/paraglide/messages.js';

const crud = orgCrud({
	table: branch,
	label: () => m.common_rec_branch(),
	addSchema: add,
	editSchema: edit,
	permission: 'settings.manage',
	audit: 'branch',
	// The package says how many branches the business may have. Only a new one takes a place.
	transform: async (values, event, before) => {
		if (!before) {
			const noRoom = await seatRefusal(orgIdOf(event.locals), 'branch');
			if (noRoom) throw new WriteRefused(null, noRoom);
		}
		return values;
	}
});

export const load = crud.load;
export const actions = crud.actions;
