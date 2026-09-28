/**
 * The arithmetic of stock, kept free of the database so it can be tested on its own.
 *
 * Quantities are DECIMAL(18,4) in the database and plain numbers here. Every result is rounded to
 * four places before it goes back, so floating-point residue (0.1 + 0.2) never reaches a column
 * or a comparison.
 */
import { getEthiopianYearMonth } from '@nahu/admin-kit/global';
import type { DocumentType } from '$lib/constants';

export function round4(n: number): number {
	return Math.round((n + Number.EPSILON) * 1e4) / 1e4;
}

/** A quantity in some unit, in base units. `factor` is base units per one of that unit. */
export function toBase(quantity: number, factor: number): number {
	return round4(quantity * factor);
}

/**
 * The moving weighted-average cost after receiving `inQty` at `inCost`.
 *
 * With nothing on hand (or less than nothing, which a correct ledger never has) the old average
 * describes no stock, so the new one is simply the cost of what arrived.
 */
export function movingAverage(onHand: number, avgCost: number, inQty: number, inCost: number) {
	if (onHand <= 0) return round4(inCost);
	return round4((onHand * avgCost + inQty * inCost) / (onHand + inQty));
}

/** A lot expiring today is still in date; yesterday, it is not. Both are `YYYY-MM-DD`. */
export function isExpired(expiryDate: string | null | undefined, today: string): boolean {
	return Boolean(expiryDate) && expiryDate! < today;
}

export type Candidate = {
	/** Null for an item that does not track lots. */
	lotId: number | null;
	quantity: number;
	expiryDate: string | null;
	status: 'available' | 'quarantine' | 'recalled' | null;
};

export type Take = { lotId: number | null; quantity: number };

/**
 * Which lots an outgoing quantity comes from: first expiry, first out.
 *
 * Lots with no expiry date go last, so a dated box always leaves before an undated one. Ties break
 * on lot id, which is the order they were received.
 *
 * Expired, quarantined and recalled stock is skipped unless `allowUnusable` — which is for writing
 * stock off or moving it into quarantine, never for issuing it to someone.
 *
 * Returns what it could take and how much it fell short. It never invents stock: a short result
 * means the shelf and the system already disagree, and the caller must say so rather than go
 * negative.
 */
export function allocate(
	candidates: Candidate[],
	quantity: number,
	options: { today: string; allowUnusable?: boolean; lotId?: number | null }
): { takes: Take[]; short: number } {
	const usable = candidates
		.filter((c) => c.quantity > 0)
		.filter((c) => options.lotId == null || c.lotId === options.lotId)
		.filter(
			(c) =>
				options.allowUnusable ||
				((c.status === null || c.status === 'available') && !isExpired(c.expiryDate, options.today))
		)
		.sort((a, b) => {
			if (a.expiryDate !== b.expiryDate) {
				if (a.expiryDate === null) return 1;
				if (b.expiryDate === null) return -1;
				return a.expiryDate < b.expiryDate ? -1 : 1;
			}
			return (a.lotId ?? 0) - (b.lotId ?? 0);
		});

	let remaining = round4(quantity);
	const takes: Take[] = [];

	for (const candidate of usable) {
		if (remaining <= 0) break;
		const take = round4(Math.min(candidate.quantity, remaining));
		takes.push({ lotId: candidate.lotId, quantity: take });
		remaining = round4(remaining - take);
	}

	return { takes, short: remaining };
}

/**
 * Serial numbers as typed: one per line, or separated by commas. Blank entries are dropped.
 * Duplicates are reported rather than silently merged, because two identical serials on one line
 * is a typing mistake the storekeeper should see.
 */
export function parseSerials(text: string | null | undefined): {
	serials: string[];
	duplicates: string[];
} {
	const serials = (text ?? '')
		.split(/[\n,]+/)
		.map((s) => s.trim())
		.filter(Boolean);
	const seen = new Set<string>();
	const duplicates = new Set<string>();
	for (const s of serials) {
		if (seen.has(s)) duplicates.add(s);
		seen.add(s);
	}
	return { serials: [...seen], duplicates: [...duplicates] };
}

/**
 * The Ethiopian fiscal year a calendar day falls in. It starts on Hamle 1 (month 11, early July),
 * so Hamle and Nehase belong to the *next* Ethiopian year's budget: Hamle 1, 2017 opens FY 2018.
 */
export function ethiopianFiscalYear(day: string): number {
	// Noon in Addis Ababa: far enough from midnight that no process time zone moves the day.
	const parts = getEthiopianYearMonth(new Date(`${day}T12:00:00+03:00`));
	if (!parts) throw new Error(`Not a date: ${day}`);
	return parts.month >= 11 ? parts.year + 1 : parts.year;
}

export const DOCUMENT_PREFIX: Record<DocumentType, string> = {
	receipt: 'GRN',
	issue: 'ISS',
	transfer: 'TRF',
	adjustment: 'ADJ'
};

/** `ADD-GRN-2019-00042`: branch, kind, fiscal year, running number. */
export function documentNumber(
	branchCode: string,
	type: DocumentType,
	fiscalYear: number,
	n: number
): string {
	return `${branchCode}-${DOCUMENT_PREFIX[type]}-${fiscalYear}-${String(n).padStart(5, '0')}`;
}
