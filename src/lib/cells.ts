/**
 * Table cells shared by the app's column definitions.
 */
import type { CellContext } from '@tanstack/table-core';
import { renderComponent } from '@nahu/admin-kit/components/ui/data-table/index.js';
import BigText from '@nahu/admin-kit/components/Table/bigText.svelte';

/**
 * Free text of any length — a note, a reason, an address, a message, who a document was issued
 * to — as its first `max` characters (BigText's 15 by default) and a "…" that opens the rest, so
 * one long entry cannot stretch the table.
 */
export function longText<Row>(max?: number) {
	return (info: CellContext<Row, unknown>) =>
		renderComponent(BigText, { text: info.getValue() as string | null, max });
}

/** Names typed in freely (a party, a buyer): long enough that most show whole. */
export const NAME_LENGTH = 24;
