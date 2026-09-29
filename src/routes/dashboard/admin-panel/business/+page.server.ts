import { fail } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { message, superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { requirePermission } from '@nahu/admin-kit/server/permissions';
import { saveUploadedFile } from '@nahu/admin-kit/server/files';
import { costLayer } from '$lib/server/db/schema';
import { localToday } from '@nahu/admin-kit/time';
import { startFifo } from '$lib/server/stock/ledger';
import { orgIdOf } from '$lib/server/tenant';
import { removeStoredFile } from '$lib/server/files';
import { seal } from '$lib/server/secrets';
import { businessSchema, logoSchema } from '$lib/schemas/business';
import { flashDone, invalidForm } from '$lib/server/actions';
import { currentOrganization as current, updateOrganization } from '../organization.server';
import type { Actions, PageServerLoad, RequestEvent } from './$types';
import { m } from '$lib/paraglide/messages.js';

export const load: PageServerLoad = async ({ locals }) => {
	const org = await current(orgIdOf(locals));
	const [form, logoForm] = await Promise.all([
		superValidate(
			{
				name: org.name,
				tin: org.tin ?? '',
				phone: org.phone ?? '',
				address: org.address ?? '',
				sellsToCustomers: org.sellsToCustomers,
				vatRegistered: org.vatRegistered,
				vatRate: org.vatRate,
				withholdingAgent: org.withholdingAgent,
				withholdingRate: org.withholdingRate,
				withholdingThreshold: org.withholdingThreshold,
				totRate: org.totRate,
				maxDiscountPercent: org.maxDiscountPercent,
				einvoiceMode: org.einvoiceMode ?? '',
				einvoiceEndpoint: org.einvoiceEndpoint ?? '',
				einvoiceTokenUrl: org.einvoiceTokenUrl ?? '',
				einvoiceClientId: org.einvoiceClientId ?? '',
				// Never sent back: the form only says whether one is stored.
				einvoiceSecret: '',
				costingMethod: org.costingMethod ?? 'average',
				reserveStock: org.reserveStock,
				approveAdjustmentsOver: org.approveAdjustmentsOver,
				approveWriteOffs: org.approveWriteOffs,
				approveCountsOver: org.approveCountsOver,
				approveOrdersOver: org.approveOrdersOver
			},
			zod4(businessSchema),
			{ errors: false }
		),
		superValidate(zod4(logoSchema))
	]);
	return {
		org: { name: org.name, logo: org.logo, createdAt: org.createdAt },
		hasEinvoiceSecret: Boolean(org.einvoiceSecret),
		form,
		logoForm
	};
};

/** Every action here changes the business itself; the route rule is checked again for the POST. */
function guard(event: RequestEvent) {
	requirePermission(event.locals, 'business.manage');
	return orgIdOf(event.locals);
}

export const actions: Actions = {
	save: async (event) => {
		const orgId = guard(event);
		const form = await superValidate(event.request, zod4(businessSchema));
		if (!form.valid) return invalidForm(form);

		const before = await current(orgId);
		const after = {
			name: form.data.name,
			tin: form.data.tin || null,
			phone: form.data.phone || null,
			address: form.data.address || null,
			sellsToCustomers: form.data.sellsToCustomers,
			vatRegistered: form.data.vatRegistered,
			vatRate: form.data.vatRate,
			withholdingAgent: form.data.withholdingAgent,
			withholdingRate: form.data.withholdingRate,
			withholdingThreshold: form.data.withholdingThreshold,
			totRate: form.data.totRate,
			maxDiscountPercent: form.data.maxDiscountPercent,
			einvoiceMode: form.data.einvoiceMode || null,
			einvoiceEndpoint: form.data.einvoiceEndpoint || null,
			einvoiceTokenUrl: form.data.einvoiceTokenUrl || null,
			einvoiceClientId: form.data.einvoiceClientId || null,
			einvoiceSecret: form.data.einvoiceSecret
				? seal(form.data.einvoiceSecret)
				: before.einvoiceSecret,
			costingMethod: form.data.costingMethod === 'fifo' ? ('fifo' as const) : null,
			reserveStock: form.data.reserveStock,
			approveAdjustmentsOver: form.data.approveAdjustmentsOver,
			approveWriteOffs: form.data.approveWriteOffs,
			approveCountsOver: form.data.approveCountsOver,
			approveOrdersOver: form.data.approveOrdersOver
		};
		const wasFifo = before.costingMethod === 'fifo';
		const isFifo = after.costingMethod === 'fifo';
		await updateOrganization(event, before, after, {
			redact: ['einvoiceSecret'],
			// Turning FIFO on: what is on hand becomes the first layer, at today's average cost.
			// Turning it off: the average carries on from where the layers left it.
			also: async (tx) => {
				if (isFifo && !wasFifo) await startFifo(tx, orgId, localToday());
				if (wasFifo && !isFifo) await tx.delete(costLayer).where(eq(costLayer.orgId, orgId));
			}
		});
		return message(form, {
			type: 'success',
			text: isFifo && !wasFifo ? m.admin_biz_saved_fifo() : m.admin_biz_saved()
		});
	},

	/** A new logo replaces the old one, whose file is deleted: nothing else ever points at it. */
	uploadLogo: async (event) => {
		const orgId = guard(event);
		const form = await superValidate(event.request, zod4(logoSchema));
		if (!form.valid)
			return message(form, { type: 'error', text: m.admin_biz_logo_type() }, { status: 400 });

		const before = await current(orgId);
		let fileName: string;
		try {
			fileName = await saveUploadedFile(form.data.logo);
		} catch (err) {
			const text = err instanceof Error ? err.message : m.admin_biz_logo_store_failed();
			return message(form, { type: 'error', text }, { status: 400 });
		}

		await updateOrganization(event, before, { logo: fileName });
		removeStoredFile(before.logo);
		return message(form, { type: 'success', text: m.admin_biz_logo_updated() });
	},

	removeLogo: async (event) => {
		const orgId = guard(event);
		const before = await current(orgId);
		if (!before.logo) return fail(404);

		await updateOrganization(event, before, { logo: null });
		removeStoredFile(before.logo);
		flashDone(event, m.admin_biz_logo_removed());
		return { removed: true };
	}
};
