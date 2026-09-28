import { error, json } from '@sveltejs/kit';
import { timingSafeEqual } from 'node:crypto';
import { env } from '$env/dynamic/private';
import { localToday } from '@nahu/admin-kit/time';
import { sendExpiryDigests } from '$lib/server/expiry';
import type { RequestHandler } from './$types';

/**
 * The daily expiry digest, for a scheduler to call once a morning:
 *
 *   curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://…/api/cron/expiry-digest
 *
 * Off (404) unless CRON_SECRET is set.
 */
export const POST: RequestHandler = async ({ request, url }) => {
	const secret = env.CRON_SECRET;
	if (!secret) error(404, 'Not found');

	const given = Buffer.from(request.headers.get('authorization')?.replace(/^Bearer /, '') ?? '');
	const expected = Buffer.from(secret);
	if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
		error(401, 'Unauthorized');
	}

	const sent = await sendExpiryDigests(localToday(), env.ORIGIN || url.origin);
	return json({ sent });
};
