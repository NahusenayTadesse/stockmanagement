import { error } from '@sveltejs/kit';
import { IMPORT_KINDS, templateCsv, type ImportKind } from '$lib/server/importer';
import type { RequestHandler } from './$types';

/** The template for one kind of import: its header row and a sample row, as CSV. */
export const GET: RequestHandler = ({ params }) => {
	const kind = params.kind as ImportKind;
	if (!IMPORT_KINDS.includes(kind)) error(404, 'No such template');
	return new Response(templateCsv(kind), {
		headers: {
			'content-type': 'text/csv; charset=utf-8',
			'content-disposition': `attachment; filename="import-${kind}.csv"`
		}
	});
};
