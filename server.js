/**
 * Production entry point.
 *
 * `build/index.js` (adapter-node's own server) would normally be enough, but
 * OpenLiteSpeed's reverse proxy forwards the client's `Origin` header *and*
 * appends a second copy of its own:
 *
 *     origin: https://influencerethiopia.com      <- sent by the browser
 *     Origin: https://influencerethiopia.com      <- added by LiteSpeed
 *
 * Node collapses duplicate headers into one comma-joined value, so SvelteKit's
 * CSRF guard compares "https://site, https://site" against url.origin, never
 * matches, and rejects every form POST with 403 "Cross-site POST form
 * submissions are forbidden".
 *
 * We keep the FIRST value, which is the one the browser actually sent, so a
 * genuine cross-site submission is still rejected. Dropping the check
 * altogether (csrf.checkOrigin: false) would have hidden the bug instead.
 */
import http from 'node:http';
import { handler } from './build/handler.js';

const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || '0.0.0.0';

/** @param {import('node:http').IncomingMessage} req */
function undouble_origin(req) {
	const origin = req.headers.origin;
	if (typeof origin === 'string' && origin.includes(',')) {
		req.headers.origin = origin.split(',')[0].trim();
	}
}

/**
 * The service worker must be re-checked on every load.
 *
 * It is served as an ordinary static file, which this app gives a four-hour
 * `max-age`, and Cloudflare sits in front and honours it. Measured on
 * production: `cf-cache-status: HIT`, `age: 927`, and the bytes served were the
 * *previous* deploy's worker — so a fix to the worker took four hours to reach
 * anybody, and a visitor arriving in the meantime installed the old one.
 *
 * A worker is not a static asset. Its filename never changes, a browser
 * re-fetches it on navigation precisely so it can be replaced, and what it
 * holds is the decision about what the app does next. `no-cache` means "ask
 * first" rather than "do not store", so an unchanged worker still costs only a
 * 304.
 *
 * It is set here rather than in `hooks.server.ts` because adapter-node serves
 * `build/client` from its own static middleware *before* SvelteKit's hooks run,
 * so a hook never sees this request. This wrapper is upstream of both.
 *
 * The origin sends no `Cache-Control` for this file on its own — checked
 * against the built server locally — so what production showed was added in
 * front of us. An explicit header is what takes that decision back: a cache
 * only invents a lifetime when the origin declines to state one.
 *
 * @param {import('node:http').ServerResponse} res
 * @param {string | undefined} url
 */
function no_cache_service_worker(res, url) {
	if (!url || url.split('?')[0] !== '/service-worker.js') return;

	res.setHeader('Cache-Control', 'no-cache, must-revalidate');

	/* And kept: the static middleware runs after this and would otherwise be
	   free to write its own value over the top. */
	const set = res.setHeader.bind(res);
	res.setHeader = (name, value) =>
		String(name).toLowerCase() === 'cache-control' ? res : set(name, value);
}

const server = http.createServer((req, res) => {
	undouble_origin(req);
	no_cache_service_worker(res, req.url);
	handler(req, res, () => {
		res.statusCode = 404;
		res.end('Not Found');
	});
});

server.listen(port, host, () => {
	console.log(`Listening on http://${host}:${port}`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
	process.on(signal, () => server.close(() => process.exit(0)));
}
