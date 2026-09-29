import { orgIdOf } from '$lib/server/tenant';
import { saleForPrint } from '$lib/server/salesDocs';
import type { PageServerLoad } from './$types';

/** The till receipt, 80 mm wide. `tendered` and `change` come from the till that just sold it. */
export const load: PageServerLoad = async ({ params, locals, url }) => {
	const sale = await saleForPrint(orgIdOf(locals), Number(params.id));
	const num = (k: string) => {
		const v = Number(url.searchParams.get(k));
		return Number.isFinite(v) && v > 0 ? v : null;
	};
	return { ...sale, tendered: num('tendered'), change: num('change') };
};
