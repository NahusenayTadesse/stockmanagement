/**
 * An HTTP bridge: a small service next to the till that drives a USB or serial fiscal device
 * (vendors ship such services; any of them can sit behind a thin adapter speaking this contract).
 *
 *   GET  {base}/status                   → { ok: boolean, machineCode?: string, message?: string }
 *   POST {base}/receipts                 → { fsNumber: string, machineCode?: string, printedAt?: string }
 *        { kind: 'sale' | 'refund', reference, buyerTin?, refundOf?: { fsNumber, machineCode },
 *          lines: [{ name, quantity, unitPrice, taxGroup, taxRate }], payments: [{ method, amount }] }
 *   POST {base}/reports/z                → { ok: boolean, message?: string }
 *
 * `unitPrice` includes VAT/TOT, as fiscal devices expect. `Authorization: Bearer <token>` when a
 * token is set.
 */

export type BridgeReceipt = {
	kind: 'sale' | 'refund';
	reference: string;
	buyerTin?: string | null;
	refundOf?: { fsNumber: string | null; machineCode: string | null } | null;
	lines: { name: string; quantity: number; unitPrice: number; taxGroup: string; taxRate: number }[];
	payments: { method: string; amount: number }[];
};

async function call(
	base: string,
	path: string,
	token: string | null,
	init: { method: 'GET' | 'POST'; body?: unknown }
) {
	const res = await fetch(
		new URL(path.replace(/^\//, ''), base.endsWith('/') ? base : `${base}/`),
		{
			method: init.method,
			headers: {
				accept: 'application/json',
				...(init.body !== undefined && { 'content-type': 'application/json' }),
				...(token && { authorization: `Bearer ${token}` })
			},
			body: init.body === undefined ? undefined : JSON.stringify(init.body),
			signal: AbortSignal.timeout(15_000)
		}
	);
	const text = await res.text();
	let json: Record<string, unknown> = {};
	try {
		json = text ? JSON.parse(text) : {};
	} catch {
		// fall through with the raw text in the error
	}
	if (!res.ok) {
		throw new Error(
			`The fiscal bridge answered ${res.status}: ${String(json.message ?? text).slice(0, 160)}`
		);
	}
	return json;
}

export async function bridgeStatus(base: string, token: string | null) {
	const r = await call(base, 'status', token, { method: 'GET' });
	return {
		ok: Boolean(r.ok),
		machineCode: (r.machineCode as string | undefined) ?? null,
		message: (r.message as string | undefined) ?? null
	};
}

export async function bridgePrint(base: string, token: string | null, receipt: BridgeReceipt) {
	const r = await call(base, 'receipts', token, { method: 'POST', body: receipt });
	const fsNumber = String(r.fsNumber ?? '').trim();
	if (!fsNumber)
		throw new Error('The fiscal bridge printed nothing it could number (no fsNumber).');
	return { fsNumber, machineCode: (r.machineCode as string | undefined) ?? null };
}

export async function bridgeZReport(base: string, token: string | null) {
	const r = await call(base, 'reports/z', token, { method: 'POST', body: {} });
	return { ok: Boolean(r.ok), message: (r.message as string | undefined) ?? null };
}
