const origin = process.env.SMOKE_ORIGIN;
if (!origin || !process.env.DEPLOY_SMOKE_EMAIL || !process.env.DEPLOY_SMOKE_PASSWORD) {
	throw new Error('Configure SMOKE_ORIGIN, DEPLOY_SMOKE_EMAIL and DEPLOY_SMOKE_PASSWORD');
}
const response = await fetch(new URL('/api/auth/sign-in/email', origin), {
	method: 'POST', headers: { 'content-type': 'application/json', origin },
	body: JSON.stringify({ email: process.env.DEPLOY_SMOKE_EMAIL, password: process.env.DEPLOY_SMOKE_PASSWORD })
});
if (!response.ok) throw new Error(`Smoke sign-in failed (${response.status})`);
const cookie = response.headers.getSetCookie().map((value) => value.split(';')[0]).join('; ');
if (!cookie) throw new Error('Smoke sign-in returned no session');
try {
	for (const path of ['/dashboard', '/dashboard/stock', '/dashboard/pos']) {
		const page = await fetch(new URL(path, origin), { headers: { cookie }, redirect: 'manual' });
		if (page.status !== 200) throw new Error(`Authenticated smoke failed: ${path} (${page.status})`);
		console.log(`Smoke passed: ${path}`);
	}
} finally {
	await fetch(new URL('/api/auth/sign-out', origin), { method: 'POST', headers: { cookie, origin, 'content-type': 'application/json' }, body: '{}' });
}
