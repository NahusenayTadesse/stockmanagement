import { error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { message, superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { redirect } from 'sveltekit-flash-message/server';
import { hasPermission, requirePermission } from '@nahu/admin-kit/server/permissions';
import { saveUploadedFile, UploadRefused } from '@nahu/admin-kit/server/files';
import { env } from '$env/dynamic/private';
import { db } from '$lib/server/db';
import { organization } from '$lib/server/db/schema';
import { orgIdOf } from '$lib/server/tenant';
import { removeStoredFile } from '$lib/server/files';
import { sendMail } from '$lib/server/mail';
import { invalidForm, refuseAction, refuseForm } from '$lib/server/actions';
import { chapaEnabled } from '$lib/server/billing/chapa';
import { ensureSubscription, packagesOnSale, seatUsage } from '$lib/server/billing/subscriptions';
import {
	bankAccounts,
	lastPaidPayment,
	latestOpenChapaAttempt,
	attemptByTxRef,
	PaymentRefused,
	PaymentStartError,
	paymentsOf,
	recordBankTransfer,
	settleOnlinePayment,
	startOnlinePayment
} from '$lib/server/billing/payments';
import { paySchema, transferSchema } from '$lib/schemas/billing';
import { priceText } from '$lib/billing';
import { m } from '$lib/paraglide/messages.js';
import type { Actions, PageServerLoad } from './$types';

const MANAGE = 'subscription.manage';

/**
 * The business's subscription: its package, what was last paid, what is due, and the two ways to
 * pay. It is also where a business that has not paid lands — the gate in `hooks.server.ts` sends
 * every other page here — so it opens for everyone in the business; the payment history and the
 * paying itself are for those who hold `subscription.manage` (owners, by default).
 */
export const load: PageServerLoad = async ({ locals, url }) => {
	const orgId = orgIdOf(locals);
	const canManage = hasPermission(locals, MANAGE);

	/*
	 * Back from Chapa (`?ref=<tx_ref>`). Nothing here trusts the redirect itself: arriving only
	 * prompts a server-side check with Chapa, and only for a reference that is this business's.
	 *
	 * A payment that went through is answered with a redirect to `?paid=<tx_ref>`, so the page is
	 * built by a fresh request: the gate and the layout worked out this request's subscription
	 * before the payment counted, and would go on showing a blocked business with no menu.
	 */
	const ref = url.searchParams.get('ref');
	const paid = url.searchParams.get('paid');
	let outcome: { status: 'paid' | 'failed' | 'pending'; reason: string | null } | null = null;
	if (ref && canManage && (await attemptByTxRef(ref))?.orgId === orgId) {
		const settled = await settleOnlinePayment(ref);
		if (settled.status === 'paid') {
			redirect(303, `/dashboard/subscription?paid=${encodeURIComponent(ref)}`);
		}
		outcome = { status: settled.status, reason: settled.reason };
	} else if (paid && canManage) {
		const attempt = await attemptByTxRef(paid);
		if (attempt?.orgId === orgId && attempt.status === 'paid') {
			outcome = { status: 'paid', reason: null };
		}
	}

	// Read after settling, so a payment confirmed a moment ago already shows.
	const view = await ensureSubscription(orgId);
	if (!view) error(503, m.billing_no_packages());

	const [org] = await db
		.select({ name: organization.name })
		.from(organization)
		.where(eq(organization.id, orgId));

	const subscription = {
		...view.state,
		startedOn: view.startedOn,
		trialEndsOn: view.trialEndsOn,
		paidUntil: view.paidUntil,
		complimentary: view.complimentary,
		suspendedReason: view.suspendedReason,
		package: view.package
	};

	if (!canManage) {
		return {
			canManage,
			business: org.name,
			subscription,
			outcome: null,
			manage: null,
			transferForm: await superValidate(zod4(transferSchema), { errors: false })
		};
	}

	const [usage, payments, lastPayment, packages, accounts, openAttempt] = await Promise.all([
		seatUsage(orgId),
		paymentsOf(orgId),
		lastPaidPayment(orgId),
		packagesOnSale(),
		bankAccounts(),
		latestOpenChapaAttempt(orgId)
	]);

	// The package to renew is the one the business is on, while it is still sold.
	const preferred = packages.find((p) => p.id === view.package.id) ?? packages[0];
	const newest = payments[0];

	return {
		canManage,
		business: org.name,
		subscription,
		outcome,
		manage: {
			usage,
			payments,
			lastPayment,
			packages,
			accounts,
			chapa: chapaEnabled(),
			// A checkout opened in the last day and not confirmed, unless this visit just checked it.
			openAttempt: openAttempt && openAttempt.txRef !== ref ? openAttempt : null,
			// A receipt waiting to be checked, and the last one if it was turned down.
			pendingTransfer: payments.find((p) => p.method === 'bank' && p.status === 'pending') ?? null,
			rejected: newest?.status === 'rejected' ? newest : null
		},
		transferForm: await superValidate(
			{ packageId: preferred?.id, bankAccountId: accounts[0]?.id },
			zod4(transferSchema),
			{ errors: false }
		)
	};
};

export const actions: Actions = {
	/** Pay online: record the attempt, then send the owner to Chapa's checkout. */
	pay: async (event) => {
		requirePermission(event.locals, MANAGE);
		const orgId = orgIdOf(event.locals);
		const form = await superValidate(event.request, zod4(paySchema));
		if (!form.valid) return refuseAction(event, m.billing_choose_package(), 400);

		const user = event.locals.user!;
		let checkoutUrl: string;
		try {
			checkoutUrl = await startOnlinePayment({
				orgId,
				packageId: form.data.packageId,
				payer: { id: user.id, name: user.name, email: user.email },
				origin: event.url.origin
			});
		} catch (err) {
			if (err instanceof PaymentRefused) return refuseAction(event, err.message, 409);
			if (err instanceof PaymentStartError) {
				console.error(`Could not start a Chapa payment for business #${orgId}:`, err);
				return refuseAction(event, m.billing_chapa_unavailable(), 502);
			}
			throw err;
		}
		redirect(303, checkoutUrl);
	},

	/** Pay by bank transfer: the account paid into and the receipt, which a site admin checks. */
	transfer: async (event) => {
		requirePermission(event.locals, MANAGE);
		const orgId = orgIdOf(event.locals);
		const form = await superValidate(event.request, zod4(transferSchema));
		if (!form.valid) return invalidForm(form);

		const { packageId, bankAccountId, reference, receipt } = form.data;

		let receiptFile: string | undefined;
		try {
			receiptFile = await saveUploadedFile(receipt);
			await recordBankTransfer({
				orgId,
				packageId,
				bankAccountId,
				receiptFile,
				payerReference: reference,
				userId: event.locals.user!.id
			});
		} catch (err) {
			// A receipt no payment points at would be a file nobody can ever see or remove.
			if (receiptFile) removeStoredFile(receiptFile);
			if (err instanceof UploadRefused) {
				return refuseForm(form, err.message, { field: 'receipt' });
			}
			if (err instanceof PaymentRefused) return refuseForm(form, err.message, { status: 409 });
			throw err;
		}

		// Tells whoever checks receipts that one is waiting, when an inbox is configured.
		const [org] = await db
			.select({ name: organization.name })
			.from(organization)
			.where(eq(organization.id, orgId));
		const packages = await packagesOnSale();
		const pkg = packages.find((p) => p.id === packageId);
		void sendMail(env.SITE_CONTACT_EMAIL?.trim(), {
			subject: `Transfer receipt to check: ${org?.name ?? `business #${orgId}`}`,
			body: [
				`${org?.name ?? `Business #${orgId}`} uploaded a bank transfer receipt` +
					(pkg ? ` for the ${pkg.name} package (${priceText(pkg.price)}).` : '.'),
				reference ? `Their reference: ${reference}` : ''
			],
			action: { label: 'Open payments', url: `${event.url.origin}/admin/payments` }
		});

		return message(form, { type: 'success', text: m.billing_transfer_received() });
	}
};
