import { env } from '$env/dynamic/private';
export function GET({ url }: { url: URL }) {
	const origin = new URL(env.ORIGIN || url.origin).origin;
	const pages = ['/', '/pricing', '/about', '/contact', '/demo', '/support'];
	const escape = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
	return new Response(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${pages.map((path) => `<url><loc>${escape(origin + path)}</loc></url>`).join('')}</urlset>`, { headers: { 'content-type': 'application/xml', 'cache-control': 'public, max-age=3600' } });
}
