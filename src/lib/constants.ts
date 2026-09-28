/**
 * The fixed value sets the database enums are built from. Here rather than in the schema so forms
 * in the browser can validate against the same lists without importing `$lib/server`.
 */
export const LOCATION_KINDS = ['storage', 'sales', 'cold', 'quarantine'] as const;
export const STORAGE_CONDITIONS = ['ambient', 'cool', 'cold', 'frozen'] as const;
export const LOT_STATUSES = ['available', 'quarantine', 'recalled'] as const;
export const SERIAL_STATUSES = ['in_stock', 'issued', 'leased', 'maintenance', 'disposed'] as const;
export const DOCUMENT_TYPES = ['receipt', 'issue', 'transfer', 'adjustment'] as const;
export const DOCUMENT_STATUSES = ['draft', 'posted', 'cancelled'] as const;
export const ADJUSTMENT_REASONS = ['count', 'damage', 'expiry', 'found', 'other'] as const;

export type DocumentType = (typeof DOCUMENT_TYPES)[number];

/** Which way money moved: added to the business (`in`) or taken out of it (`out`). */
export const TRANSACTION_DIRECTIONS = ['in', 'out'] as const;
export const TRANSACTION_STATUSES = ['recorded', 'verified', 'void'] as const;
export const TRANSACTION_PURPOSES = [
	'purchase',
	'sale',
	'expense',
	'other_income',
	'other'
] as const;
export const PAYMENT_KINDS = ['cash', 'mobile_money', 'bank', 'cheque', 'other'] as const;

export const COUNT_STATUSES = ['open', 'posted', 'cancelled'] as const;
export const PO_STATUSES = [
	'draft',
	'ordered',
	'partially_received',
	'received',
	'closed',
	'cancelled'
] as const;
