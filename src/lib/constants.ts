/**
 * The fixed value sets the database enums are built from. Here rather than in the schema so forms
 * in the browser can validate against the same lists without importing `$lib/server`.
 */
/**
 * `transit` locations are made by the system, one per branch: stock dispatched to that branch
 * sits there until the branch receives it. Nobody picks them on a form.
 */
export const LOCATION_KINDS = ['storage', 'sales', 'cold', 'quarantine', 'transit'] as const;
export const STORAGE_CONDITIONS = ['ambient', 'cool', 'cold', 'frozen'] as const;
export const LOT_STATUSES = ['available', 'quarantine', 'recalled'] as const;
export const SERIAL_STATUSES = [
	'in_stock',
	'issued',
	'leased',
	'maintenance',
	'disposed',
	'returned'
] as const;
export const DOCUMENT_TYPES = [
	'receipt',
	'issue',
	'transfer',
	'adjustment',
	'sales_return',
	'purchase_return'
] as const;
/** The types a person starts from the "new document" form. Returns start from what they return. */
export const CREATABLE_TYPES = ['receipt', 'issue', 'transfer', 'adjustment'] as const;
export const RETURN_TYPES = ['sales_return', 'purchase_return'] as const;
/** VAT treatment of an item: standard rate, zero-rated (exports, some foods), or exempt. */
export const TAX_CODES = ['standard', 'zero', 'exempt'] as const;
/** `in_transit`: a transfer to another branch, dispatched and not yet received there. */
export const DOCUMENT_STATUSES = ['draft', 'in_transit', 'posted', 'cancelled'] as const;
export const ADJUSTMENT_REASONS = [
	'count',
	'damage',
	'expiry',
	'found',
	'opening',
	'other'
] as const;

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

/** How the app talks to a fiscal device. Empty means manual. */
export const FISCAL_DEVICE_KINDS = ['manual', 'datecs_tcp', 'http_bridge'] as const;

/** A department's request for stock from the store: asked, approved (or not), then issued. */
export const REQUISITION_STATUSES = [
	'draft',
	'submitted',
	'approved',
	'rejected',
	'issued',
	'cancelled'
] as const;

/** What a second person must approve before it happens (maker-checker). */
export const APPROVAL_KINDS = ['adjustment', 'count', 'purchase_order'] as const;
export const APPROVAL_STATUSES = ['pending', 'approved', 'rejected', 'withdrawn'] as const;

/** How stock leaving is valued: the moving average, or the oldest purchases first. */
export const COSTING_METHODS = ['average', 'fifo'] as const;

/** Costs of bringing goods in, on top of the supplier's price. */
export const LANDED_COST_KINDS = [
	'freight',
	'insurance',
	'duty',
	'excise',
	'surtax',
	'clearing',
	'transport',
	'other'
] as const;
/** How a landed cost is shared out over a receipt's lines. */
export const LANDED_COST_METHODS = ['value', 'quantity', 'weight'] as const;

/** What happened to a text message. `dry_run`: logged but not sent (`SMS_DRY_RUN=true`). */
export const SMS_STATUSES = ['sent', 'failed', 'skipped', 'dry_run'] as const;

// ── The platform: packages, subscriptions and what businesses pay Digital Construct ──

/** How often a package is paid for, in months. */
export const BILLING_PERIODS = [1, 3, 6, 12] as const;
/**
 * How a subscription payment was made: online through Chapa, by bank transfer with an uploaded
 * receipt, or recorded by a site admin (cash, a cheque, a courtesy).
 */
export const SUBSCRIPTION_PAYMENT_METHODS = ['chapa', 'bank', 'manual'] as const;
/**
 * `pending`: started (Chapa) or waiting for the receipt to be checked (bank). `paid`: confirmed,
 * and the subscription was extended. `failed`: Chapa said no. `rejected`: a site admin turned the
 * receipt down. `cancelled`: replaced by a later attempt.
 */
export const SUBSCRIPTION_PAYMENT_STATUSES = [
	'pending',
	'paid',
	'failed',
	'rejected',
	'cancelled'
] as const;
/** A message from the contact page: not yet looked at, or dealt with. */
export const CONTACT_STATUSES = ['new', 'handled'] as const;
