/**
 * The building blocks of the app's table columns, so every table sorts, shows long text, dates,
 * money and statuses the same way. Column files compose these rather than defining their own.
 *
 * Headers are given as message functions (`m.common_status`), called when the table renders —
 * a column list is a module constant, and a label read at module load would be in the first
 * viewer's language for everyone.
 */
import type { CellContext, ColumnDef, HeaderContext } from '@tanstack/table-core';
import { renderComponent } from '@nahu/admin-kit/components/ui/data-table/index.js';
import DataTableSort from '@nahu/admin-kit/components/Table/data-table-sort.svelte';
import Statuses from '@nahu/admin-kit/components/Table/statuses.svelte';
import BigText from '@nahu/admin-kit/components/Table/bigText.svelte';
import { ethiopianDate, ethiopianDateTime } from '@nahu/admin-kit/tableCells';
import DataTableLinks from '@nahu/admin-kit/components/Table/data-table-links.svelte';
import { formatETB } from '@nahu/admin-kit/global';
import StackedText from '$lib/components/StackedText.svelte';
import { DOCUMENT_STATUS_BADGE, DOCUMENT_STATUS_LABELS, qty } from '$lib/format';
import { m } from '$lib/paraglide/messages.js';

type Label = () => string;

/** A header that sorts the column when clicked. */
export function sortable<Row>(label: Label) {
	return ({ column }: HeaderContext<Row, unknown>) =>
		renderComponent(DataTableSort, { name: label(), onclick: column.getToggleSortingHandler() });
}

/** A plain text column: blank for no value. */
export function textColumn<Row>(key: keyof Row & string, label: Label): ColumnDef<Row> {
	return {
		accessorKey: key,
		get header() {
			return label();
		},
		cell: (info) => (info.getValue() as string | null) ?? ''
	};
}

/**
 * Free text of any length — a note, a reason, an address, a message, a name typed in freely — as
 * its first `max` characters (BigText's 15 by default) and a "…" that opens the rest, so one long
 * entry cannot stretch the table.
 */
export function longText<Row>(max?: number) {
	return (info: CellContext<Row, unknown>) =>
		renderComponent(BigText, { text: info.getValue() as string | null, max });
}

/** Names typed in freely (a party, a buyer, a department): long enough that most show whole. */
export const NAME_LENGTH = 24;

/** A day, on the Ethiopian calendar like every date the app shows. */
export function dateCell<Row>(info: CellContext<Row, unknown>) {
	return ethiopianDate(info.getValue());
}

/** A moment (created, decided, sent), on the Ethiopian calendar with the time in Addis Ababa. */
export function dateTimeCell<Row>(info: CellContext<Row, unknown>) {
	return info.getValue() ? ethiopianDateTime(info.getValue()) : '';
}

/** An amount in birr; blank rather than "ETB 0.00" when there is none. */
export function moneyCell<Row>(info: CellContext<Row, unknown>) {
	const value = info.getValue();
	return value === null || value === undefined || value === '' ? '' : formatETB(Number(value));
}

/**
 * A status badge. `status` picks the colour (the kit knows confirmed, pending, cancelled, active,
 * approved…); `label` is what it says, in the viewer's language.
 */
export function statusCell(status: string | null | undefined, label?: string) {
	return renderComponent(Statuses, { status, label });
}

// ── Column shapes ────────────────────────────────────────────────────────────────────────────
// Amounts, quantities and percentages are right-aligned, so their digits line up.

type Cell<Row> = ColumnDef<Row>['cell'];
/** A column's `meta` for amounts and quantities. */
export const RIGHT = { align: 'right' } as const;

/**
 * A column read by `key`, headed by `label`; `cell` when the raw value is not what to show, and
 * `meta` for its alignment or classes.
 *
 * Build on this by passing arguments, never by spreading its result: the header is a getter, so
 * it is asked when the table renders, and a spread would read it once, in one language.
 */
export function column<Row>(
	key: keyof Row & string,
	label: Label,
	cell?: Cell<Row>,
	meta?: ColumnDef<Row>['meta']
): ColumnDef<Row> {
	return {
		accessorKey: key,
		get header() {
			return label();
		},
		...(cell ? { cell } : {}),
		...(meta ? { meta } : {})
	};
}

/** A column worked out from the row (a translated status, a class name): sorts and filters on it. */
export function derivedColumn<Row>(
	id: string,
	label: Label,
	value: (row: Row) => unknown
): ColumnDef<Row> {
	return {
		id,
		get header() {
			return label();
		},
		accessorFn: value
	};
}

/** An amount in birr, right-aligned; blank for none. */
export function moneyColumn<Row>(key: keyof Row & string, label: Label): ColumnDef<Row> {
	return column<Row>(key, label, moneyCell, RIGHT);
}

/** A day, on the Ethiopian calendar. */
export function dateColumn<Row>(key: keyof Row & string, label: Label): ColumnDef<Row> {
	return column<Row>(key, label, dateCell);
}

/** A quantity in the row's own unit, right-aligned. */
export function quantityColumn<Row extends { unit: string }>(
	key: keyof Row & string,
	label: Label
): ColumnDef<Row> {
	return column<Row>(
		key,
		label,
		({ row }) => qty(row.original[key] as number, row.original.unit),
		RIGHT
	);
}

/** A percentage, right-aligned; `empty` for no value. */
export function percentColumn<Row>(
	key: keyof Row & string,
	label: Label,
	empty = '—'
): ColumnDef<Row> {
	return column<Row>(key, label, (i) => (i.getValue() == null ? empty : `${i.getValue()}%`), RIGHT);
}

/** Blank values shown as a dash. */
export function orDashColumn<Row>(key: keyof Row & string, label: Label): ColumnDef<Row> {
	return column<Row>(key, label, (i) => i.getValue() ?? '—');
}

/** A link to a record's page, by the app's entity map (`ENTITIES`); plain text without an id. */
export function linkColumn<Row>(
	key: keyof Row & string,
	label: Label,
	entity: string,
	target: (row: Row) => { id: number | string | null; name: string }
): ColumnDef<Row> {
	return column<Row>(key, label, ({ row }) => {
		const { id, name } = target(row.original);
		return id ? recordLink(entity, id, name) : name;
	});
}

/** The row's place in the list as it is shown. */
export function indexColumn<Row>(): ColumnDef<Row> {
	return { id: 'index', header: '#', cell: (info) => info.row.index + 1, enableSorting: false };
}

// ── Cells ────────────────────────────────────────────────────────────────────────────────────

/** A record named in a cell, as a link when the viewer may open it. */
export function recordLink(entity: string, id: string | number | null, name: string) {
	return renderComponent(DataTableLinks, { id, name, entity });
}

/** On or off: the colour follows the English word; the badge says it in the viewer's language. */
export function activeCell(active: boolean | null | undefined) {
	return statusCell(
		active ? 'Active' : 'Inactive',
		active ? m.common_active() : m.common_inactive()
	);
}

/** A stock document's status as a badge: draft, in transit, posted, cancelled. */
export function documentStatusCell(status: string) {
	return statusCell(
		DOCUMENT_STATUS_BADGE[status] ?? status,
		DOCUMENT_STATUS_LABELS[status as keyof typeof DOCUMENT_STATUS_LABELS] ?? status
	);
}

/**
 * The stock documents raised from something — an order's receipts, a requisition's issues — as
 * a table: the document (linked), its date and its status. Call it when the page renders.
 */
export function documentColumns<
	Row extends { id: number; number: string | null; docDate: string; status: string }
>(heading: string, draftName: (id: number) => string): ColumnDef<Row>[] {
	return [
		{
			accessorKey: 'number',
			header: heading,
			cell: ({ row }) =>
				recordLink('document', row.original.id, row.original.number ?? draftName(row.original.id))
		},
		{ accessorKey: 'docDate', header: m.common_date(), cell: dateCell },
		{
			accessorKey: 'status',
			header: m.common_status(),
			cell: ({ row }) => documentStatusCell(row.original.status)
		}
	];
}

// ── Lines and totals ─────────────────────────────────────────────────────────────────────────

/** A cell of a few lines: the first as it is, the rest small under it (an item and its code). */
export function stackedCell(...lines: (string | null | undefined | false)[]) {
	return renderComponent(StackedText, { lines });
}

/** Details on one line, the empty ones left out: "SKU-1 · a note". */
export const joined = (...parts: (string | null | undefined | false)[]) =>
	parts.filter(Boolean).join(' · ');

/**
 * The tax lines under a priced document's rows, for DataTable's `summary`: before tax, VAT and
 * TOT where any is charged (VAT always, for a VAT-registered seller), then the total.
 */
export function taxSummary(
	totals: { net: number; vat: number; tot: number; gross: number },
	{ vatRegistered = false }: { vatRegistered?: boolean } = {}
) {
	const showVat = Boolean(totals.vat) || vatRegistered;
	return [
		...(showVat || totals.tot
			? [{ label: m.sales_pos_before_tax(), value: formatETB(totals.net) }]
			: []),
		...(showVat ? [{ label: m.sales_vat(), value: formatETB(totals.vat) }] : []),
		...(totals.tot ? [{ label: m.sales_tot(), value: formatETB(totals.tot) }] : []),
		{ label: m.common_total(), value: formatETB(totals.gross), strong: true }
	];
}
