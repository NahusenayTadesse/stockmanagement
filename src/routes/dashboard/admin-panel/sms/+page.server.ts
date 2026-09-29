import { message, superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { env } from '$env/dynamic/private';
import { requirePermission } from '@nahu/admin-kit/server/permissions';
import { orgIdOf } from '$lib/server/tenant';
import { DAY_MS } from '$lib/server/days';
import { formatEthPhone } from '$lib/phone';
import { sendSms, smsLog, smsSettings } from '$lib/server/sms';
import { smsSettingsSchema, smsWriteSchema } from '$lib/schemas/sms';
import { invalidForm } from '$lib/server/actions';
import { currentOrganization, updateOrganization } from '../organization.server';
import type { Actions, PageServerLoad } from './$types';
import { m } from '$lib/paraglide/messages.js';

export const load: PageServerLoad = async ({ locals }) => {
	const orgId = orgIdOf(locals);
	const settings = (await smsSettings(orgId))!;
	const [form, testForm, log] = await Promise.all([
		superValidate(
			{
				smsEnabled: settings.enabled,
				smsSales: settings.sales,
				smsPayments: settings.payments,
				smsAlertPhones: settings.alertPhones ?? '',
				smsSignature: settings.signature ?? ''
			},
			zod4(smsSettingsSchema),
			{ errors: false }
		),
		superValidate(zod4(smsWriteSchema)),
		smsLog(orgId)
	]);
	const month = new Date(Date.now() - 30 * DAY_MS);
	const recent = log.filter((m) => new Date(m.createdAt) >= month);
	return {
		form,
		testForm,
		log,
		businessName: settings.name,
		// What the server can do, whatever the business chose.
		server: { configured: Boolean(env.SMS_KEY), dryRun: env.SMS_DRY_RUN === 'true' },
		month: {
			sent: recent.filter((m) => m.status === 'sent').length,
			units: recent.reduce((s, m) => s + (m.units ?? 0), 0),
			failed: recent.filter((m) => m.status === 'failed').length
		}
	};
};

export const actions: Actions = {
	save: async (event) => {
		requirePermission(event.locals, 'business.manage');
		const orgId = orgIdOf(event.locals);
		const form = await superValidate(event.request, zod4(smsSettingsSchema));
		if (!form.valid) return invalidForm(form);
		// Kept in one spelling, so the alert list reads the same everywhere.
		const phones = form.data.smsAlertPhones
			.split(/[,;\n]/)
			.map((p) => formatEthPhone(p.trim()))
			.flatMap((p) => ('phone' in p ? [p.phone] : []));
		const values = {
			smsEnabled: form.data.smsEnabled,
			smsSales: form.data.smsSales,
			smsPayments: form.data.smsPayments,
			smsAlertPhones: [...new Set(phones)].join(', ') || null,
			smsSignature: form.data.smsSignature || null
		};
		await updateOrganization(event, await currentOrganization(orgId), values);
		return message(form, { type: 'success', text: m.admin_sms_saved() });
	},

	/** A message to a number of the person's choosing, to see texts arrive. */
	test: async (event) => {
		requirePermission(event.locals, 'business.manage');
		const orgId = orgIdOf(event.locals);
		const form = await superValidate(event.request, zod4(smsWriteSchema));
		if (!form.valid) return invalidForm(form);
		const r = await sendSms(orgId, {
			to: form.data.to,
			text: form.data.text,
			kind: 'test',
			userId: event.locals.user?.id
		});
		if (!r.ok) {
			return message(
				form,
				{ type: 'error', text: r.error ?? m.admin_sms_not_sent() },
				{ status: r.status === 'off' ? 409 : 502 }
			);
		}
		return message(form, {
			type: 'success',
			text: r.status === 'dry_run' ? m.admin_sms_test_logged() : m.admin_sms_test_sent()
		});
	}
};
