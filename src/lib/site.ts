/**
 * Who the public site speaks for. One place, so a changed phone number or a renamed product is
 * one edit: the header, the footer, the contact page and the page titles all read from here.
 */
export const SITE = {
	/** The product, as the site names it. */
	product: 'Digital Construct Stock',
	/** The product's short name, beside the company logo. */
	productShort: 'Stock',
	company: 'Digital Construct',
	email: 'digitalconstructet@gmail.com',
	phones: ['0955 92 89 86', '0910 50 89 41'],
	website: 'digitalconstruct.io',
	websiteUrl: 'https://digitalconstruct.io',
	city: 'Addis Ababa, Ethiopia'
} as const;

/**
 * A phone as a `tel:` link dials it, from the local way of writing it or the international one:
 * `0955 92 89 86`, `+251 955 928 986` and `955928986` all become `+251955928986`.
 */
export function telNumber(phone: string) {
	const digits = phone.replace(/\D/g, '');
	const local = digits.startsWith('251') ? digits.slice(3) : digits.replace(/^0/, '');
	return `+251${local}`;
}

/** A page's browser-tab title: the page first, then the product. */
export const pageTitle = (page?: string) => (page ? `${page} · ${SITE.product}` : SITE.product);
