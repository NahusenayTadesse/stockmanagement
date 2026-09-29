import { error } from '@sveltejs/kit';
import { orgIdOf } from '$lib/server/tenant';
import { amountInWords, saleForPrint } from '$lib/server/salesDocs';
import type { PageServerLoad } from './$types';

/** The A4 invoice of a posted sale (or credit note of a customer return). */
export const load: PageServerLoad = async ({ params, locals }) => {
	const sale = await saleForPrint(orgIdOf(locals), Number(params.id));
	if (sale.doc.status !== 'posted') error(409, 'Only a posted sale has an invoice.');
	return { ...sale, inWords: amountInWords(sale.totals?.gross ?? 0) };
};
