import { fail } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { message, superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { setFlash } from 'sveltekit-flash-message/server';
import { requirePermission } from '@nahu/admin-kit/server/permissions';
import { recordAudit } from '@nahu/admin-kit/server/audit';
import { saveUploadedFile } from '@nahu/admin-kit/server/files';
import { db } from '$lib/server/db';
import { organization } from '$lib/server/db/schema';
import { orgIdOf } from '$lib/server/tenant';
import { removeStoredFile } from '$lib/server/files';
import { businessSchema, logoSchema } from '$lib/schemas/business';
import type { Actions, PageServerLoad, RequestEvent } from './$types';

async function current(orgId: number) {
	const [org] = await db.select().from(organization).where(eq(organization.id, orgId));
	return org;
}

export const load: PageServerLoad = async ({ locals }) => {
	const org = await current(orgIdOf(locals));
	const [form, logoForm] = await Promise.all([
		superValidate(
			{ name: org.name, tin: org.tin ?? '', phone: org.phone ?? '', address: org.address ?? '' },
			zod4(businessSchema),
			{ errors: false }
		),
		superValidate(zod4(logoSchema))
	]);
	return { org: { name: org.name, logo: org.logo, createdAt: org.createdAt }, form, logoForm };
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
		if (!form.valid)
			return message(form, { type: 'error', text: 'Please check the form' }, { status: 400 });

		const before = await current(orgId);
		const after = {
			name: form.data.name,
			tin: form.data.tin || null,
			phone: form.data.phone || null,
			address: form.data.address || null
		};
		await db.transaction(async (tx) => {
			await tx.update(organization).set(after).where(eq(organization.id, orgId));
			await recordAudit(tx, event, {
				table: 'organization',
				recordId: orgId,
				action: 'update',
				before,
				after
			});
		});
		return message(form, { type: 'success', text: 'Business details saved' });
	},

	/** A new logo replaces the old one, whose file is deleted: nothing else ever points at it. */
	uploadLogo: async (event) => {
		const orgId = guard(event);
		const form = await superValidate(event.request, zod4(logoSchema));
		if (!form.valid)
			return message(
				form,
				{ type: 'error', text: 'Choose a PNG, JPG or WebP image' },
				{ status: 400 }
			);

		const before = await current(orgId);
		let fileName: string;
		try {
			fileName = await saveUploadedFile(form.data.logo);
		} catch (err) {
			const text = err instanceof Error ? err.message : 'Could not store the logo.';
			return message(form, { type: 'error', text }, { status: 400 });
		}

		await db.transaction(async (tx) => {
			await tx.update(organization).set({ logo: fileName }).where(eq(organization.id, orgId));
			await recordAudit(tx, event, {
				table: 'organization',
				recordId: orgId,
				action: 'update',
				before: { logo: before.logo },
				after: { logo: fileName }
			});
		});
		removeStoredFile(before.logo);
		return message(form, { type: 'success', text: 'Logo updated' });
	},

	removeLogo: async (event) => {
		const orgId = guard(event);
		const before = await current(orgId);
		if (!before.logo) return fail(404);

		await db.transaction(async (tx) => {
			await tx.update(organization).set({ logo: null }).where(eq(organization.id, orgId));
			await recordAudit(tx, event, {
				table: 'organization',
				recordId: orgId,
				action: 'update',
				before: { logo: before.logo },
				after: { logo: null }
			});
		});
		removeStoredFile(before.logo);
		setFlash({ type: 'success', message: 'Logo removed' }, event.cookies);
		return { removed: true };
	}
};
