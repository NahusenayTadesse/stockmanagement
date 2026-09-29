/**
 * Rounding and writing amounts, the same way everywhere — server and browser alike.
 *
 * Money is kept to the cent and quantities to four places (the database's DECIMAL scales), so a
 * floating-point residue (0.1 + 0.2) never reaches a column, a comparison or a screen.
 */

/** To the cent. Accepts what a query returns (a string for DECIMAL sums) as well as numbers. */
export function cents(value: unknown): number {
	return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

/** To four places: quantities, unit costs. */
export function round4(value: number): number {
	return Math.round((value + Number.EPSILON) * 1e4) / 1e4;
}

const AMOUNT = new Intl.NumberFormat('en-US', {
	minimumFractionDigits: 2,
	maximumFractionDigits: 2
});

/** An amount with two decimals and thousands separators, for sentences: "12,303.99". */
export function amountText(value: unknown): string {
	return AMOUNT.format(cents(value));
}
