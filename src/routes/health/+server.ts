import { sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import type { RequestHandler } from './$types';

/**
 * What a reverse proxy, a container orchestrator or an uptime check asks.
 *
 * It touches the database, because "the Node process is listening" is not the
 * question anyone is really asking — an app that cannot reach MySQL serves 500s
 * from every route while answering a naive TCP check perfectly.
 *
 * Deliberately says nothing else: no version, no table counts, no connection
 * string. `ok` or `degraded`, and the round-trip time.
 */
export const GET: RequestHandler = async () => {
	const started = Date.now();

	try {
		await db.execute(sql`select 1`);
	} catch {
		return new Response(JSON.stringify({ status: 'degraded', database: 'unreachable' }), {
			status: 503,
			headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }
		});
	}

	return new Response(
		JSON.stringify({ status: 'ok', database: 'ok', latencyMs: Date.now() - started }),
		{ headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } }
	);
};
