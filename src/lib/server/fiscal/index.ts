/**
 * Fiscal receipts: the legal receipt printed by an MoR-registered device for a sale, whose FS No.
 * and machine code (MRC) are kept on the sale.
 *
 * Optional throughout. A business with no device never sees any of this. Printing happens after a
 * sale is posted and committed — a device that is off or out of paper never loses a sale; the
 * failure is recorded on it and can be retried, or the number typed in from the device by hand.
 */
import { m } from '$lib/paraglide/messages.js';
import { and, eq, isNull, or } from 'drizzle-orm';
import { db } from '$lib/server/db';
import {
	customer,
	fiscalDevice,
	item,
	paymentMethod,
	stockDocument,
	stockDocumentLine,
	transactions
} from '$lib/server/db/schema';
import { unseal } from '$lib/server/secrets';
import { DatecsConnection, CMD, printReceipt } from './datecs';
import { bridgePrint, bridgeStatus, bridgeZReport } from './bridge';

type Device = typeof fiscalDevice.$inferSelect;

export class FiscalError extends Error {}

/** The example mapping from tax to the device's tax groups; each device may set its own. */
export const DEFAULT_TAX_GROUPS = '15=A,0=B,exempt=C,tot=D';

/**
 * Datecs payment types by our payment method. Firmware differs: P is cash almost everywhere; check
 * the others against the device's manual and adjust.
 */
const DATECS_PAYMENT: Record<string, string> = { cash: 'P', cheque: 'C', credit: 'N', other: 'D' };

export function parseTaxGroups(spec: string | null | undefined): Record<string, string> {
	const out: Record<string, string> = {};
	for (const pair of (spec || DEFAULT_TAX_GROUPS).split(',')) {
		const [k, v] = pair.split('=').map((x) => x.trim());
		if (k && v) out[k.toLowerCase()] = v;
	}
	return out;
}

/** The active device for a branch: one set for the branch first, then one for any branch. */
export async function deviceFor(orgId: number, branchId: number | null) {
	const devices = await db
		.select()
		.from(fiscalDevice)
		.where(
			and(
				eq(fiscalDevice.orgId, orgId),
				isNull(fiscalDevice.deletedAt),
				or(eq(fiscalDevice.isActive, true), isNull(fiscalDevice.isActive))
			)
		);
	return (
		devices.find((d) => branchId !== null && d.branchId === branchId) ??
		devices.find((d) => d.branchId === null) ??
		null
	);
}

async function orgDevice(orgId: number, deviceId: number) {
	const [d] = await db
		.select()
		.from(fiscalDevice)
		.where(
			and(
				eq(fiscalDevice.id, deviceId),
				eq(fiscalDevice.orgId, orgId),
				isNull(fiscalDevice.deletedAt)
			)
		);
	if (!d) throw new FiscalError(m.sales_fis_no_device());
	return d;
}

/** A posted sale (or customer return) as a device receipt: prices include VAT and TOT. */
export async function receiptFor(orgId: number, documentId: number, device: Device) {
	const [doc] = await db
		.select({
			doc: stockDocument,
			buyerTin: customer.tin,
			method: paymentMethod.name
		})
		.from(stockDocument)
		.leftJoin(customer, eq(customer.id, stockDocument.customerId))
		.leftJoin(transactions, eq(transactions.id, stockDocument.transactionId))
		.leftJoin(paymentMethod, eq(paymentMethod.id, transactions.paymentMethodId))
		.where(and(eq(stockDocument.id, documentId), eq(stockDocument.orgId, orgId)));
	if (!doc) throw new FiscalError(m.sales_ret_no_doc());
	const d = doc.doc;
	if (d.status !== 'posted' || (d.type !== 'issue' && d.type !== 'sales_return')) {
		throw new FiscalError(m.sales_fis_posted_only());
	}

	const lines = await db
		.select({
			quantity: stockDocumentLine.quantity,
			unitPrice: stockDocumentLine.unitPrice,
			vatRate: stockDocumentLine.vatRate,
			totRate: stockDocumentLine.totRate,
			name: item.name,
			taxCode: item.taxCode
		})
		.from(stockDocumentLine)
		.innerJoin(item, eq(item.id, stockDocumentLine.itemId))
		.where(and(eq(stockDocumentLine.documentId, d.id), isNull(stockDocumentLine.deletedAt)));
	if (lines.some((l) => l.unitPrice === null)) {
		throw new FiscalError(m.sales_fis_every_line_priced());
	}

	const groups = parseTaxGroups(device.taxGroups);
	const groupOf = (l: (typeof lines)[number]) => {
		const key =
			l.taxCode === 'exempt'
				? 'exempt'
				: (l.totRate ?? 0) > 0
					? 'tot'
					: String(Number(l.vatRate ?? 0));
		const g = groups[key] ?? groups['0'];
		if (!g) throw new FiscalError(m.sales_fis_no_tax_group({ key }));
		return g;
	};
	const receiptLines = lines.map((l) => ({
		name: l.name,
		quantity: l.quantity,
		unitPrice:
			Math.round(l.unitPrice! * (1 + ((l.vatRate ?? 0) + (l.totRate ?? 0)) / 100) * 100) / 100,
		taxGroup: groupOf(l),
		taxRate: (l.vatRate ?? 0) + (l.totRate ?? 0)
	}));
	const total =
		Math.round(receiptLines.reduce((s, l) => s + l.unitPrice * l.quantity, 0) * 100) / 100;

	const methodName = (doc.method ?? '').toLowerCase();
	const method = !d.transactionId
		? d.customerId
			? 'credit'
			: 'cash'
		: methodName.includes('cash')
			? 'cash'
			: methodName.includes('cheque')
				? 'cheque'
				: 'other';

	let refundOf: { fsNumber: string | null; machineCode: string | null } | null = null;
	if (d.type === 'sales_return' && d.returnOfId) {
		const [orig] = await db
			.select({
				fsNumber: stockDocument.fiscalReceiptNumber,
				machineCode: stockDocument.fiscalMachineCode
			})
			.from(stockDocument)
			.where(eq(stockDocument.id, d.returnOfId));
		refundOf = orig ?? null;
	}

	return {
		doc: d,
		kind: d.type === 'sales_return' ? ('refund' as const) : ('sale' as const),
		buyerTin: doc.buyerTin,
		refundOf,
		lines: receiptLines,
		payments: [{ method, amount: total }],
		total
	};
}

async function markFiscal(documentId: number, values: Partial<typeof stockDocument.$inferInsert>) {
	await db.update(stockDocument).set(values).where(eq(stockDocument.id, documentId));
}

/**
 * Prints the fiscal receipt of a posted sale on the branch's device (or the one given) and keeps
 * its FS No. A manual device only marks the sale as waiting for the number to be typed in.
 */
export async function printFiscal(
	orgId: number,
	documentId: number,
	deviceId?: number
): Promise<{ ok: true; fsNumber: string | null } | { ok: false; error: string }> {
	const [d] = await db
		.select({ branchId: stockDocument.branchId, fs: stockDocument.fiscalReceiptNumber })
		.from(stockDocument)
		.where(and(eq(stockDocument.id, documentId), eq(stockDocument.orgId, orgId)));
	if (!d) return { ok: false, error: m.sales_ret_no_doc() };
	if (d.fs) return { ok: false, error: m.sales_fis_already({ number: d.fs }) };

	const device = deviceId ? await orgDevice(orgId, deviceId) : await deviceFor(orgId, d.branchId);
	if (!device) return { ok: false, error: m.sales_fis_none_for_branch() };

	try {
		const receipt = await receiptFor(orgId, documentId, device);
		const kind = device.kind ?? 'manual';

		if (kind === 'manual') {
			await markFiscal(documentId, {
				fiscalDeviceId: device.id,
				fiscalMachineCode: device.machineCode,
				fiscalStatus: 'pending',
				fiscalError: null
			});
			return { ok: true, fsNumber: null };
		}

		let fsNumber: string;
		let machineCode = device.machineCode;
		if (kind === 'datecs_tcp') {
			if (receipt.kind === 'refund') {
				throw new FiscalError(m.sales_fis_refund_on_device());
			}
			if (!device.host || !device.port) throw new FiscalError(m.sales_fis_set_address());
			const conn = await DatecsConnection.connect(device.host, device.port);
			try {
				const printed = await printReceipt(conn, {
					operatorCode: device.operatorCode ?? '1',
					operatorPassword: unseal(device.operatorPassword) ?? '0000',
					till: device.tillNumber ?? 1,
					lines: receipt.lines.map((l) => ({
						name: l.name,
						quantity: l.quantity,
						price: l.unitPrice,
						taxGroup: l.taxGroup
					})),
					payments: receipt.payments.map((p) => ({
						code: DATECS_PAYMENT[p.method] ?? 'P',
						amount: p.amount
					})),
					footer: receipt.doc.number ?? undefined
				});
				fsNumber = printed.fiscalNumber;
			} finally {
				conn.close();
			}
		} else {
			if (!device.bridgeUrl) throw new FiscalError(m.sales_fis_set_bridge());
			const printed = await bridgePrint(device.bridgeUrl, unseal(device.bridgeToken), {
				kind: receipt.kind,
				reference: receipt.doc.number ?? `#${receipt.doc.id}`,
				buyerTin: receipt.buyerTin,
				refundOf: receipt.refundOf,
				lines: receipt.lines,
				payments: receipt.payments
			});
			fsNumber = printed.fsNumber;
			machineCode = printed.machineCode ?? machineCode;
		}

		await markFiscal(documentId, {
			fiscalDeviceId: device.id,
			fiscalReceiptNumber: fsNumber,
			fiscalMachineCode: machineCode,
			fiscalStatus: 'printed',
			fiscalPrintedAt: new Date(),
			fiscalError: null
		});
		return { ok: true, fsNumber };
	} catch (err) {
		const error = err instanceof Error ? err.message : m.sales_fis_print_failed();
		await markFiscal(documentId, {
			fiscalDeviceId: device.id,
			fiscalStatus: 'failed',
			fiscalError: error.slice(0, 255)
		});
		return { ok: false, error };
	}
}

/** The FS No. typed in from a receipt the device printed on its own. */
export async function recordManualFiscal(
	orgId: number,
	documentId: number,
	input: { fsNumber: string; machineCode: string | null },
	conn: Pick<typeof db, 'update'> = db
) {
	await conn
		.update(stockDocument)
		.set({
			fiscalReceiptNumber: input.fsNumber,
			fiscalMachineCode: input.machineCode,
			fiscalStatus: 'manual',
			fiscalPrintedAt: new Date(),
			fiscalError: null
		})
		.where(and(eq(stockDocument.id, documentId), eq(stockDocument.orgId, orgId)));
}

/**
 * Asks the device how it is. Harmless: prints nothing. `ok` says whether it answered well — the
 * message is in the viewer's language, so nothing should be read off its wording.
 */
export async function checkDevice(orgId: number, deviceId: number) {
	const device = await orgDevice(orgId, deviceId);
	let message: string;
	let ok = true;
	try {
		if ((device.kind ?? 'manual') === 'manual') {
			message = m.sales_fis_manual_nothing();
		} else if (device.kind === 'datecs_tcp') {
			if (!device.host || !device.port) throw new FiscalError(m.sales_fis_set_address());
			const conn = await DatecsConnection.connect(device.host, device.port);
			try {
				const diag = await conn.send(CMD.diagnostics);
				message = m.sales_fis_connected({ info: diag.data || m.sales_fis_device_answered() });
			} finally {
				conn.close();
			}
		} else {
			if (!device.bridgeUrl) throw new FiscalError(m.sales_fis_set_bridge());
			const s = await bridgeStatus(device.bridgeUrl, unseal(device.bridgeToken));
			message = `${s.ok ? m.sales_fis_ready() : m.sales_fis_not_ready()}${s.message ? `: ${s.message}` : ''}`;
			ok = s.ok;
		}
	} catch (err) {
		ok = false;
		message = m.sales_fis_failed({
			error: err instanceof Error ? err.message : m.sales_fis_no_answer()
		});
	}
	await db
		.update(fiscalDevice)
		.set({ lastStatus: message.slice(0, 255), lastCheckedAt: new Date() })
		.where(eq(fiscalDevice.id, device.id));
	return { ok, message };
}

/** The daily Z report: closes the fiscal day on the device. */
export async function zReport(orgId: number, deviceId: number) {
	const device = await orgDevice(orgId, deviceId);
	if (device.kind === 'datecs_tcp') {
		if (!device.host || !device.port) throw new FiscalError(m.sales_fis_set_address());
		const conn = await DatecsConnection.connect(device.host, device.port);
		try {
			await conn.send(CMD.dailyReport, '0');
		} finally {
			conn.close();
		}
	} else if (device.kind === 'http_bridge') {
		if (!device.bridgeUrl) throw new FiscalError(m.sales_fis_set_bridge());
		const r = await bridgeZReport(device.bridgeUrl, unseal(device.bridgeToken));
		if (!r.ok) throw new FiscalError(r.message ?? m.sales_fis_bridge_no_z());
	} else {
		throw new FiscalError(m.sales_fis_z_on_device());
	}
	await db
		.update(fiscalDevice)
		.set({ lastZReportAt: new Date() })
		.where(eq(fiscalDevice.id, device.id));
}
