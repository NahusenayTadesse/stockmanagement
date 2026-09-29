import type { Reroute } from '@sveltejs/kit';

/**
 * No locale in the URL: the language is a cookie (see the paraglide strategy in vite.config.ts),
 * so paths are left as they are.
 */
export const reroute: Reroute = (request) => request.url.pathname;
