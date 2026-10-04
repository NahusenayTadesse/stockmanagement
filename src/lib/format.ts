/** Display helpers shared by pages and table columns. Client-safe. */
import { m } from '$lib/paraglide/messages.js';
import { formatETB, formatEthiopianDate } from '@nahu/admin-kit/global';

/** A `YYYY-MM-DD` day as a moment: noon in Addis Ababa, so no time zone moves the day. */
export const dayNoon = (day: string) => new Date(`${day}T12:00:00+03:00`);

/** A `YYYY-MM-DD` day written out on the Ethiopian calendar, for sentences and details. */
export const ethiopianDay = (day: string) => formatEthiopianDate(dayNoon(day));

/** For printed papers: the Ethiopian day, with the Gregorian one in brackets. */
export const printedDay = (day: string) => `${ethiopianDay(day)} E.C. (${day} G.C.)`;

const QTY = new Intl.NumberFormat('en-US', { maximumFractionDigits: 4 });

/** A quantity without trailing zeros: 12, 2.5, 0.125. */
export function qty(value: number | string | null | undefined, unit?: string | null): string {
	if (value === null || value === undefined || value === '') return '—';
	const text = QTY.format(Number(value));
	return unit ? `${text} ${unit}` : text;
}

/**
 * Labels read in the viewer's language at the moment they are read: each value is a getter
 * calling its message, so a module-level constant still speaks the language of the request (on
 * the server) or of the page (in the browser), and every existing `LABELS[key]` keeps working.
 */
export function labels<K extends string>(map: Record<K, () => string>): Record<K, string> {
	const out = {} as Record<K, string>;
	for (const key of Object.keys(map) as K[]) {
		Object.defineProperty(out, key, { get: map[key], enumerable: true });
	}
	return out;
}

/** `{ value, name }` choices for a picker, named in the viewer's language. */
export function choices<V extends string>(list: [V, () => string][]) {
	return list.map(([value, name]) => ({
		value,
		get name() {
			return name();
		}
	}));
}

export const DOCUMENT_LABELS = labels({
	receipt: m.common_doc_receipt,
	issue: m.common_doc_issue,
	transfer: m.common_doc_transfer,
	adjustment: m.common_doc_adjustment,
	sales_return: m.common_doc_sales_return,
	purchase_return: m.common_doc_purchase_return
});

export const DOCUMENT_STATUS_LABELS = labels({
	draft: m.common_status_draft,
	in_transit: m.common_status_in_transit,
	posted: m.common_status_posted,
	cancelled: m.common_status_cancelled
});

/** What the tax office said about an e-invoice. */
/** Which badge colour a document status takes (the kit's badge knows these words). */
export const DOCUMENT_STATUS_BADGE: Record<string, string> = {
	posted: 'confirmed',
	draft: 'pending',
	in_transit: 'pending',
	cancelled: 'cancelled'
};

/** Money that moved in (+) or out (−): "+ ETB 1,200.00". */
export function signedAmount(direction: 'in' | 'out', amount: number) {
	return `${direction === 'in' ? '+' : '−'} ${formatETB(amount)}`;
}

export const EINVOICE_STATUS_LABELS: Record<string, string> = labels({
	submitted: m.common_einv_submitted,
	accepted: m.common_einv_accepted,
	rejected: m.common_einv_rejected,
	failed: m.common_einv_failed,
	cancelled: m.common_einv_cancelled
});

export const MOVEMENT_LABELS: Record<string, string> = labels({
	receipt: m.common_move_receipt,
	issue: m.common_move_issue,
	transfer_out: m.common_move_transfer_out,
	transfer_in: m.common_move_transfer_in,
	adjustment_in: m.common_move_adjustment_in,
	adjustment_out: m.common_move_adjustment_out,
	sales_return: m.common_move_sales_return,
	purchase_return: m.common_move_purchase_return,
	transit_loss: m.common_move_transit_loss
});

export const TAX_CODE_LABELS: Record<string, string> = labels({
	standard: m.common_tax_standard,
	zero: m.common_tax_zero,
	exempt: m.common_tax_exempt
});

/** The kinds a person may give a location. `transit` is the system's own; see LOCATION_KIND_LABELS. */
export const LOCATION_KINDS = choices([
	['storage', m.common_loc_storage],
	['sales', m.common_loc_sales],
	['cold', m.common_loc_cold],
	['quarantine', m.common_loc_quarantine]
]);

export const LOCATION_KIND_LABELS: Record<string, string> = labels({
	storage: m.common_loc_storage,
	sales: m.common_loc_sales,
	cold: m.common_loc_cold,
	quarantine: m.common_loc_quarantine,
	transit: m.common_loc_transit
});

export const ADJUSTMENT_REASONS = choices([
	['count', m.common_reason_count],
	['damage', m.common_reason_damage],
	['expiry', m.common_reason_expiry],
	['found', m.common_reason_found],
	['opening', m.common_reason_opening],
	['other', m.common_reason_other]
]);
