import { packagesOnSale } from '$lib/server/billing/subscriptions';
import { bankAccounts } from '$lib/server/billing/payments';
import { chapaEnabled } from '$lib/server/billing/chapa';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const [packages, accounts] = await Promise.all([packagesOnSale(), bankAccounts()]);
	return {
		packages,
		// Which ways of paying the page may promise.
		payOnline: chapaEnabled(),
		payByBank: accounts.length > 0
	};
};
