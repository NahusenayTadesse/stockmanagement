import { fail } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { requirePermission } from '@nahu/admin-kit/server/permissions';
import { localToday } from '@nahu/admin-kit/time';
import { setFlash } from 'sveltekit-flash-message/server';
import { db } from '$lib/server/db';
import { organization } from '$lib/server/db/schema';
import { orgIdOf } from '$lib/server/tenant';
import {
	COLUMNS,
	columnLabel,
	columnNote,
	IMPORT_KINDS,
	ImportError,
	MAX_ROWS,
	planImport,
	readTable,
	runImport,
	type ImportKind,
	type SheetRow
} from '$lib/server/importer';
import type { Actions, PageServerLoad } from './$types';
import { m } from '$lib/paraglide/messages.js';
import { labels } from '$lib/format';

const KIND_NAMES: Record<ImportKind, string> = labels({
	items: m.admin_imp_kind_items,
	suppliers: m.admin_imp_kind_suppliers,
	customers: m.admin_imp_kind_customers,
	opening: m.admin_imp_kind_opening
});

async function kindsFor(orgId: number) {
	const [org] = await db
		.select({ sells: organization.sellsToCustomers })
		.from(organization)
		.where(eq(organization.id, orgId));
	// An internal store has no customers to import.
	return IMPORT_KINDS.filter((k) => k !== 'customers' || org?.sells);
}

function kindOf(value: FormDataEntryValue | null): ImportKind | null {
	return IMPORT_KINDS.includes(value as ImportKind) ? (value as ImportKind) : null;
}

export const load: PageServerLoad = async ({ locals }) => {
	const kinds = await kindsFor(orgIdOf(locals));
	return {
		kinds: kinds.map((k) => ({
			value: k,
			name: KIND_NAMES[k],
			columns: COLUMNS[k].map((c) => ({
				label: columnLabel(c.key, c.label),
				note: c.note ? columnNote(c.note) : null
			}))
		})),
		maxRows: MAX_ROWS
	};
};

export const actions: Actions = {
	/** Reads the file and says what would happen to every row. Writes nothing. */
	preview: async ({ request, locals }) => {
		requirePermission(locals, 'data.import');
		const orgId = orgIdOf(locals);
		const data = await request.formData();
		const kind = kindOf(data.get('kind'));
		const file = data.get('file');
		if (!kind || !(await kindsFor(orgId)).includes(kind)) {
			return fail(400, { error: m.admin_imp_choose_kind() });
		}
		if (!(file instanceof File) || !file.size)
			return fail(400, { error: m.admin_imp_choose_file() });
		try {
			const { rows, ignored } = await readTable(kind, {
				name: file.name,
				bytes: new Uint8Array(await file.arrayBuffer())
			});
			const plan = await planImport(db, orgId, kind, rows);
			return { preview: { kind, fileName: file.name, ignored, plan, rows } };
		} catch (err) {
			if (err instanceof ImportError) return fail(400, { error: err.message });
			throw err;
		}
	},

	/**
	 * Imports the rows the preview read, planning them again first: what the browser sends back is
	 * checked like anything else a form posts. All rows or none.
	 */
	import: async ({ request, locals, cookies }) => {
		requirePermission(locals, 'data.import');
		const orgId = orgIdOf(locals);
		const data = await request.formData();
		const kind = kindOf(data.get('kind'));
		if (!kind || !(await kindsFor(orgId)).includes(kind)) {
			return fail(400, { error: m.admin_imp_choose_kind() });
		}
		let rows: SheetRow[];
		try {
			const parsed: unknown = JSON.parse(String(data.get('rows') ?? '[]'));
			if (!Array.isArray(parsed) || !parsed.length || parsed.length > MAX_ROWS) throw new Error();
			rows = parsed.map((r) => {
				if (typeof r?.row !== 'number' || typeof r?.values !== 'object' || !r.values) {
					throw new Error();
				}
				const values: Record<string, string> = {};
				for (const col of COLUMNS[kind]) {
					const v = r.values[col.key];
					if (v !== undefined) values[col.key] = String(v).slice(0, 5000);
				}
				return { row: r.row, values };
			});
		} catch {
			return fail(400, { error: m.admin_imp_preview_lost() });
		}

		try {
			const result = await db.transaction((tx) =>
				runImport(tx, { orgId, kind, rows, userId: locals.user?.id, today: localToday() })
			);
			const what =
				kind === 'opening'
					? m.admin_imp_opening_posted({
							numbers: result.documents.map((d) => d.number).join(', ')
						})
					: m.admin_imp_added_updated({ created: result.created, updated: result.updated });
			setFlash(
				{ type: 'success', message: m.admin_imp_done({ kind: KIND_NAMES[kind], what }) },
				cookies
			);
			return { imported: { kind, ...result } };
		} catch (err) {
			if (err instanceof ImportError) return fail(400, { error: err.message });
			throw err;
		}
	}
};
