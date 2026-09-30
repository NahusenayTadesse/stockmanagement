import { contentCrud } from '@nahu/admin-kit/server/crud';
import { servicePackage } from '$lib/server/db/schema';
import { packageAdd, packageEdit } from '$lib/schemas/billing';
import { m } from '$lib/paraglide/messages.js';
import type { PageServerLoad } from './$types';

/**
 * The packages on sale. A retired package (inactive) leaves the pricing page and the register
 * form at once; businesses already on it keep it until they pay for another.
 */
const crud = contentCrud({
	table: servicePackage,
	label: () => m.billing_package(),
	addSchema: packageAdd,
	editSchema: packageEdit,
	// Typed one per line, kept as a list.
	listFields: ['highlights']
});

export const load: PageServerLoad = async () => {
	const data = await crud.load();
	return {
		...data,
		// Back to one per line, which is how the form edits them.
		rows: data.rows.map((row) => ({ ...row, highlights: (row.highlights ?? []).join('\n') }))
	};
};

export const actions = crud.actions;
