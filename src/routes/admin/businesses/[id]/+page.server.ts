import { error } from '@sveltejs/kit';
import { message, superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { db } from '$lib/server/db';
import { flashDone, invalidForm, refuseForm } from '$lib/server/actions';
import {
	businessRow,
	changeSubscription,
	packageChoices,
	paymentRows,
	resumeBusiness,
	suspendBusiness
} from '$lib/server/billing/admin';
import { confirmReceipt, rejectReceipt } from '$lib/server/billing/adminActions';
import { PaymentRefused, recordManualPayment } from '$lib/server/billing/payments';
import { ensureSubscription } from '$lib/server/billing/subscriptions';
import { manualPaymentSchema, subscriptionSchema, suspendSchema } from '$lib/schemas/billing';
import { m } from '$lib/paraglide/messages.js';
import type { Actions, PageServerLoad } from './$types';

/** The business in the URL, or a 404. */
function businessId(params: { id: string }) {
	const id = Number(params.id);
	if (!Number.isInteger(id) || id <= 0) error(404, m.common_not_found());
	return id;
}

export const load: PageServerLoad = async ({ params }) => {
	const id = businessId(params);
	// One registered before subscriptions existed gets its trial now, so there is a row to change.
	await ensureSubscription(id).catch(() => null);

	const [business, payments, packages] = await Promise.all([
		businessRow(id),
		paymentRows(id),
		packageChoices()
	]);
	if (!business) error(404, m.common_not_found());

	const current = packages.find((p) => p.value === business.packageId) ?? packages[0];

	return {
		business,
		payments,
		receipts: payments.filter((p) => p.method === 'bank' && p.status === 'pending'),
		packages,
		subscriptionForm: await superValidate(
			{
				packageId: business.packageId ?? current?.value,
				paidUntil: business.paidUntil ?? undefined,
				complimentary: business.complimentary
			},
			zod4(subscriptionSchema),
			{ errors: false }
		),
		paymentForm: await superValidate(
			{ packageId: current?.value, amount: current?.price },
			zod4(manualPaymentSchema),
			{ errors: false }
		),
		suspendForm: await superValidate(zod4(suspendSchema))
	};
};

export const actions: Actions = {
	/** Another package, another end date, or complimentary: decided here, effective at once. */
	subscription: async ({ request, params }) => {
		const id = businessId(params);
		const form = await superValidate(request, zod4(subscriptionSchema));
		if (!form.valid) return invalidForm(form);

		const packages = await packageChoices();
		if (!packages.some((p) => p.value === form.data.packageId)) {
			return refuseForm(form, m.billing_package_gone(), { field: 'packageId' });
		}
		await changeSubscription(id, form.data);
		return message(form, { type: 'success', text: m.platform_subscription_saved() });
	},

	/** Money taken by hand. It counts at once and extends the subscription by the package's period. */
	payment: async ({ request, params, locals }) => {
		const id = businessId(params);
		const form = await superValidate(request, zod4(manualPaymentSchema));
		if (!form.valid) return invalidForm(form);

		try {
			await db.transaction((tx) =>
				recordManualPayment(tx, {
					orgId: id,
					packageId: form.data.packageId,
					amount: form.data.amount,
					note: form.data.note,
					reviewerId: locals.user!.id
				})
			);
		} catch (err) {
			if (err instanceof PaymentRefused) {
				return refuseForm(form, err.message, { field: 'packageId' });
			}
			throw err;
		}
		return message(form, { type: 'success', text: m.platform_payment_recorded() });
	},

	suspend: async ({ request, params }) => {
		const id = businessId(params);
		const form = await superValidate(request, zod4(suspendSchema));
		if (!form.valid) return invalidForm(form);

		await suspendBusiness(id, form.data.reason);
		return message(form, { type: 'success', text: m.platform_suspended() });
	},

	resume: async (event) => {
		await resumeBusiness(businessId(event.params));
		flashDone(event, m.platform_resumed());
		return { done: true as const };
	},

	confirm: confirmReceipt,
	reject: rejectReceipt
};
