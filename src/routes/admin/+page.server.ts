import { platformStats } from '$lib/server/billing/admin';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => ({ stats: await platformStats() });
