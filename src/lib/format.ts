/** Display helpers shared by pages and table columns. Client-safe. */

const QTY = new Intl.NumberFormat('en-US', { maximumFractionDigits: 4 });

/** A quantity without trailing zeros: 12, 2.5, 0.125. */
export function qty(value: number | string | null | undefined, unit?: string | null): string {
	if (value === null || value === undefined || value === '') return '—';
	const text = QTY.format(Number(value));
	return unit ? `${text} ${unit}` : text;
}

export const DOCUMENT_LABELS = {
	receipt: 'Goods receipt',
	issue: 'Issue',
	transfer: 'Transfer',
	adjustment: 'Adjustment'
} as const;

export const MOVEMENT_LABELS: Record<string, string> = {
	receipt: 'Received',
	issue: 'Issued',
	transfer_out: 'Transferred out',
	transfer_in: 'Transferred in',
	adjustment_in: 'Adjusted in',
	adjustment_out: 'Adjusted out'
};

export const LOCATION_KINDS = [
	{ value: 'storage', name: 'Store room' },
	{ value: 'sales', name: 'Sales floor' },
	{ value: 'cold', name: 'Cold storage' },
	{ value: 'quarantine', name: 'Quarantine' }
];

export const ADJUSTMENT_REASONS = [
	{ value: 'count', name: 'Stock count' },
	{ value: 'damage', name: 'Damaged' },
	{ value: 'expiry', name: 'Expired' },
	{ value: 'found', name: 'Found' },
	{ value: 'other', name: 'Other' }
];
