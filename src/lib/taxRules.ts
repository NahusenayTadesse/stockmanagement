/**
 * The tax arithmetic, shared by the server (posting, reports) and the till's live preview, so
 * the total a cashier sees is the total that posts. See `$lib/server/tax` for the rules in words.
 */

export type TaxBasis = {
	vatRegistered: boolean;
	vatRate: number;
	/** Empty: not a TOT payer. */
	totRate: number | null;
};

export type TaxCode = 'standard' | 'zero' | 'exempt';

/** VAT on a sale line: only a registered business charges it, and only on standard items. */
export function saleVatRate(settings: TaxBasis, taxCode: TaxCode) {
	return settings.vatRegistered && taxCode === 'standard' ? settings.vatRate : 0;
}

/** TOT on a sale line, or null: a TOT payer that is not VAT-registered, at the item's rate if set. */
export function saleTotRate(settings: TaxBasis, itemTotRate: number | null) {
	if (settings.vatRegistered || settings.totRate === null) return null;
	return itemTotRate ?? settings.totRate;
}

const cents = (n: number) => Math.round(n * 100) / 100;

/** A line's money: before tax, VAT and TOT (each rounded per line, as on the paper), and total. */
export function lineAmounts(
	quantity: number,
	price: number | null,
	vatRate: number | null,
	totRate: number | null = null
) {
	const net = cents(quantity * (price ?? 0));
	const vat = cents((net * (vatRate ?? 0)) / 100);
	const tot = cents((net * (totRate ?? 0)) / 100);
	return { net, vat, tot, gross: cents(net + vat + tot) };
}
