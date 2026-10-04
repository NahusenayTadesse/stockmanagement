import { json } from '@sveltejs/kit';
import { schemaReady } from '$lib/server/readiness';

export async function GET() {
	try {
		if (await schemaReady()) return json({ status: 'ok' }, { headers: { 'cache-control': 'no-store' } });
	} catch { /* A missing migration table or failed database connection is not ready. */ }
	return json({ status: 'degraded' }, { status: 503, headers: { 'cache-control': 'no-store' } });
}
