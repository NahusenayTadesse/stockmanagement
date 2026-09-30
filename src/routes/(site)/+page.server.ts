import { packagesOnSale } from '$lib/server/billing/subscriptions';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => ({ packages: await packagesOnSale() });
