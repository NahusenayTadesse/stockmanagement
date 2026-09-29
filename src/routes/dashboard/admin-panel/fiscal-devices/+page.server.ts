import { fail } from '@sveltejs/kit';
import { setFlash } from 'sveltekit-flash-message/server';
import { WriteRefused } from '@nahu/admin-kit/server/childCrud';
import { requirePermission } from '@nahu/admin-kit/server/permissions';
import { branch, fiscalDevice } from '$lib/server/db/schema';
import { orgCrud, orgIdOf } from '$lib/server/tenant';
import { belongsToOrg, branchOptions } from '$lib/server/options';
import { seal } from '$lib/server/secrets';
import { checkDevice, DEFAULT_TAX_GROUPS, FiscalError, zReport } from '$lib/server/fiscal';
import { add, edit } from './schema';
import type { Actions, PageServerLoad } from './$types';

const blank = (v: unknown) => (v === '' || v === undefined ? null : v);

const crud = orgCrud({
	table: fiscalDevice,
	label: 'Fiscal device',
	addSchema: add,
	editSchema: edit,
	permission: 'settings.manage',
	audit: 'fiscal_device',
	/**
	 * Empty inputs are stored as empty (nothing here is required). Secrets are sealed; left empty on
	 * an edit, the stored one stays — the form never shows it.
	 */
	transform: async (values, event, before) => {
		const orgId = orgIdOf(event.locals);
		if (Number(values.branchId)) {
			await belongsToOrg(branch, values.branchId, orgId, 'branchId', 'branch');
		}
		if (values.kind === 'datecs_tcp' && values.host && !values.port) {
			throw new WriteRefused('port', 'Give the port the device listens on.');
		}
		const out: Record<string, unknown> = {};
		for (const [k, v] of Object.entries(values)) out[k] = blank(v);
		out.branchId = Number(values.branchId) || null;
		out.bridgeToken = values.bridgeToken
			? seal(String(values.bridgeToken))
			: (before?.bridgeToken ?? null);
		out.operatorPassword = values.operatorPassword
			? seal(String(values.operatorPassword))
			: (before?.operatorPassword ?? null);
		return out;
	}
});

export const load: PageServerLoad = async (event) => {
	const orgId = orgIdOf(event.locals);
	const [section, branches] = await Promise.all([crud.load(event), branchOptions(orgId)]);
	return {
		...section,
		// Secrets never reach the browser: only whether one is set.
		rows: (section.rows as (typeof fiscalDevice.$inferSelect)[]).map((d) => ({
			...d,
			branchId: d.branchId ?? 0,
			branch: branches.find((b) => b.value === d.branchId)?.name ?? 'Any branch',
			bridgeToken: '',
			operatorPassword: '',
			hasToken: Boolean(d.bridgeToken),
			hasPassword: Boolean(d.operatorPassword)
		})),
		branches: [{ value: 0, name: 'Any branch' }, ...branches],
		defaultTaxGroups: DEFAULT_TAX_GROUPS
	};
};

export const actions: Actions = {
	...crud.actions,

	/** Asks the device (or bridge) whether it is there. Prints nothing. */
	check: async (event) => {
		requirePermission(event.locals, 'settings.manage');
		const id = Number((await event.request.formData()).get('id'));
		const message = await checkDevice(orgIdOf(event.locals), id);
		setFlash({ type: message.startsWith('Failed') ? 'error' : 'success', message }, event.cookies);
		return { message };
	},

	/** The daily Z report, which closes the fiscal day on the device. */
	zReport: async (event) => {
		requirePermission(event.locals, 'settings.manage');
		const id = Number((await event.request.formData()).get('id'));
		try {
			await zReport(orgIdOf(event.locals), id);
		} catch (err) {
			const message = err instanceof Error ? err.message : 'The Z report failed.';
			setFlash({ type: 'error', message }, event.cookies);
			return fail(err instanceof FiscalError ? 400 : 502, { message });
		}
		setFlash({ type: 'success', message: 'Z report printed' }, event.cookies);
		return { done: true };
	}
};
