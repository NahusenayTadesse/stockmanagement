import type { ColumnDef } from '@tanstack/table-core';
import { MOVEMENT_LABELS } from '$lib/format';
import { longText, NAME_LENGTH } from '$lib/table';
import { m } from '$lib/paraglide/messages.js';
import type { PageData } from './$types';
import { column, date, documentColumn } from '../columnKit';

type Event = PageData['units'][number]['events'][number];

/** One unit's history: what happened to it, where, with whom, on which document. */
export const eventColumns: ColumnDef<Event>[] = [
	date('day', m.common_date),
	column(
		'kind',
		m.reports_what_happened,
		(i) => MOVEMENT_LABELS[i.getValue() as string] ?? i.getValue()
	),
	column('location', m.reports_where),
	column('who', m.reports_from_to, longText(NAME_LENGTH)),
	documentColumn('documentNumber', (e) => ({ id: e.documentId, number: e.documentNumber }))
];
