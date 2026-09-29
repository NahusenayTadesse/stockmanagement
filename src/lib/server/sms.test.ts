import { beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { configureKit } from '@nahu/admin-kit/server/db';
import { inRollback } from '@nahu/admin-kit/server/testing/rollback';

import { db } from '$lib/server/db';
import { organization, smsMessage } from '$lib/server/db/schema';
import { createOrganization } from '$lib/server/seedPermissions';
import { capSms, deliver, formatEthPhone, sendSms, SMS_LIMIT } from './sms';

/**
 * Text messages. Nothing here reaches GeezSMS: every send either runs in test mode or goes to a
 * stand-in `fetch` that answers the way the provider does.
 */

beforeAll(() => configureKit({ db }));

/** A stand-in for GeezSMS, recording what it was sent. */
function fakeProvider(reply: { status?: number; body: unknown } | Error) {
	const calls: { url: string; form: URLSearchParams }[] = [];
	const fetcher = (async (url: string, init: RequestInit) => {
		calls.push({ url, form: init.body as URLSearchParams });
		if (reply instanceof Error) throw reply;
		return new Response(JSON.stringify(reply.body), { status: reply.status ?? 200 });
	}) as unknown as typeof fetch;
	return { calls, fetcher };
}

describe('numbers and text', () => {
	it('reads Ethiopian mobile numbers however they are written, and refuses the rest', () => {
		for (const n of ['0911 234 567', '+251-911-234-567', '911234567', '251911234567']) {
			expect(formatEthPhone(n)).toEqual({ phone: '251911234567' });
		}
		expect(formatEthPhone('0712345678')).toEqual({ phone: '251712345678' });
		expect(formatEthPhone('011 661 2345')).toHaveProperty('error');
		expect(formatEthPhone('')).toHaveProperty('error');
		expect(formatEthPhone(null)).toHaveProperty('error');
	});

	it('shortens long messages on a word, with an ellipsis', () => {
		const long = 'word '.repeat(100);
		const capped = capSms(long);
		expect(capped.length).toBeLessThanOrEqual(SMS_LIMIT);
		expect(capped.endsWith('word…')).toBe(true);
		expect(capSms('short')).toBe('short');
	});
});

describe('the provider', () => {
	it('posts the token, number and message, and reads success, refusal and silence', async () => {
		const ok = fakeProvider({
			body: { error: false, msg: 'SMS has been sent successfully.', sms_units: 2 }
		});
		expect(await deliver('251911234567', 'Hello', { fetcher: ok.fetcher, token: 'T' })).toEqual({
			ok: true,
			units: 2
		});
		expect(ok.calls[0].url).toBe('https://api.geezsms.com/api/v1/sms/send');
		expect(Object.fromEntries(ok.calls[0].form)).toEqual({
			token: 'T',
			phone: '251911234567',
			msg: 'Hello'
		});

		const refused = fakeProvider({ body: { error: true, msg: 'API Not found' } });
		expect(await deliver('251911234567', 'x', { fetcher: refused.fetcher, token: 'T' })).toEqual({
			ok: false,
			error: 'API Not found'
		});

		const down = fakeProvider(new Error('connect ETIMEDOUT'));
		expect(await deliver('251911234567', 'x', { fetcher: down.fetcher, token: 'T' })).toEqual({
			ok: false,
			error: 'connect ETIMEDOUT'
		});

		expect((await deliver('251911234567', 'x', { fetcher: ok.fetcher, token: '' })).ok).toBe(false);
	});
});

describe('sending', () => {
	it('sends nothing while the business has SMS off; signs, sends and logs once it is on', async () => {
		const r = await inRollback(async (tx) => {
			const { orgId } = await createOrganization(tx, { name: 'SMS test shop' });
			const provider = fakeProvider({ body: { error: false, sms_units: 1 } });
			const opts = { conn: tx, fetcher: provider.fetcher, token: 'T', dryRun: false };

			const off = await sendSms(orgId, { to: '0911234567', text: 'Hi', kind: 'test' }, opts);
			await tx
				.update(organization)
				.set({ smsEnabled: true, smsSignature: 'Selam Shop' })
				.where(eq(organization.id, orgId));
			const sent = await sendSms(orgId, { to: '0911 234 567', text: 'Hi', kind: 'test' }, opts);
			const badNumber = await sendSms(
				orgId,
				{ to: '011 111 1111', text: 'Hi', kind: 'test' },
				opts
			);
			const testMode = await sendSms(
				orgId,
				{ to: '0911234567', text: 'Hi', kind: 'test' },
				{ ...opts, dryRun: true }
			);
			const log = await tx.select().from(smsMessage).where(eq(smsMessage.orgId, orgId));
			return { off, sent, badNumber, testMode, log, calls: provider.calls.length };
		});
		expect(r.off).toMatchObject({ ok: false, status: 'off' });
		expect(r.sent).toMatchObject({ ok: true, status: 'sent' });
		expect(r.badNumber).toMatchObject({ ok: false, status: 'skipped' });
		expect(r.testMode).toMatchObject({ ok: true, status: 'dry_run' });
		// Only the one real send reached the provider; all three attempts are in the log.
		expect(r.calls).toBe(1);
		expect(r.log.map((m) => [m.status, m.phone, m.body])).toEqual([
			['sent', '251911234567', 'Selam Shop: Hi'],
			['skipped', '011 111 1111', 'Selam Shop: Hi'],
			['dry_run', '251911234567', 'Selam Shop: Hi']
		]);
		expect(r.log[0].units).toBe(1);
	});
});
