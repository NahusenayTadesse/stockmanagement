/**
 * The refusals stock code throws. Kept apart from the posting service, with no imports, so modules
 * the posting service itself imports can throw them too.
 */

/** A refusal the storekeeper can act on. `lineId` points at the line that caused it. */
export class StockError extends Error {
	constructor(
		message: string,
		readonly lineId?: number
	) {
		super(message);
		this.name = 'StockError';
	}
}

/**
 * Not refused, but not one person's to do: it waits for a second person (maker-checker). The
 * caller records an approval request — outside the transaction this rolls back — and says so.
 */
export class ApprovalRequired extends StockError {
	constructor(
		readonly kind: 'adjustment' | 'count' | 'purchase_order',
		readonly value: number,
		readonly reason: string
	) {
		super(`This needs a second person's approval: ${reason}.`);
		this.name = 'ApprovalRequired';
	}
}
