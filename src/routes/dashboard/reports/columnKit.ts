/**
 * The reports' column shapes. The general ones — a named column, an amount, a day, a quantity in
 * its unit, a percent, a link — are the app's own (`$lib/table`), re-exported under the short
 * names the report column files use; only what is particular to reports is defined here.
 */
import { column, linkColumn } from '$lib/table';
import { m } from '$lib/paraglide/messages.js';

export {
	column,
	derivedColumn as derived,
	moneyColumn as money,
	dateColumn as date,
	quantityColumn as quantity,
	percentColumn as percent,
	orDashColumn as orDash,
	linkColumn as link
} from '$lib/table';

/** The item, linked to its page. */
export const itemColumn = <Row extends { itemId: number; item: string }>() =>
	linkColumn<Row>('item' as keyof Row & string, m.common_item, 'item', (r) => ({
		id: r.itemId,
		name: r.item
	}));

/** The item's code. */
export const skuColumn = <Row extends { sku: string }>() =>
	column<Row>('sku' as keyof Row & string, m.reports_col_code);

/** A stock document's number, linked to it. */
export const documentColumn = <Row>(
	key: keyof Row & string,
	target: (row: Row) => { id: number; number: string | null }
) =>
	linkColumn<Row>(key, m.reports_col_document, 'document', (r) => {
		const d = target(r);
		return { id: d.id, name: d.number ?? `#${d.id}` };
	});
