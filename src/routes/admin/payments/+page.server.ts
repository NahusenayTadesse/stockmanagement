import { paymentRows } from '$lib/server/billing/admin';
import { confirmReceipt, rejectReceipt } from '$lib/server/billing/adminActions';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const payments = await paymentRows();
	return {
		payments,
		receipts: payments.filter((p) => p.method === 'bank' && p.status === 'pending')
	};
};

export const actions: Actions = { confirm: confirmReceipt, reject: rejectReceipt };
