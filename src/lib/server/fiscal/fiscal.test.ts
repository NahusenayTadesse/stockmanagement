import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import net from 'node:net';
import { and, eq } from 'drizzle-orm';
import { configureKit } from '@nahu/admin-kit/server/db';
import { inRollback } from '@nahu/admin-kit/server/testing/rollback';

import { db } from '$lib/server/db';
import {
	customer,
	item,
	location,
	organization,
	stockDocument,
	stockDocumentLine,
	supplier,
	uom
} from '$lib/server/db/schema';
import { createOrganization } from '$lib/server/seedPermissions';
import { postDocument } from '$lib/server/stock/post';
import { customerStatement } from '$lib/server/credit';
import { submitEinvoice, toProviderPayload, type Invoice } from '$lib/server/einvoice';
import {
	CMD,
	DatecsConnection,
	deviceText,
	frame,
	parseReply,
	printReceipt,
	replyFrame,
	statusError
} from './datecs';
import { parseTaxGroups, recordManualFiscal } from './index';

beforeAll(() => configureKit({ db }));

/** The request a device would read: LEN, SEQ, CMD and DATA, with the checksum verified. */
function readRequest(buf: Buffer) {
	const bytes = [...buf];
	expect(bytes[0]).toBe(0x01);
	expect(bytes.at(-1)).toBe(0x03);
	const pst = bytes.length - 6;
	expect(bytes[pst]).toBe(0x05);
	const counted = bytes.slice(1, pst + 1);
	expect(bytes[1]).toBe(0x20 + counted.length);
	const sum = counted.reduce((s, b) => s + b, 0);
	const bcc = [12, 8, 4, 0].map((sh) => ((sum >> sh) & 0x0f) + 0x30);
	expect(bytes.slice(pst + 1, pst + 5)).toEqual(bcc);
	return {
		seq: bytes[2],
		cmd: bytes[3],
		data: Buffer.from(bytes.slice(4, pst)).toString('latin1')
	};
}

let server: net.Server | null = null;
afterEach(() => new Promise<void>((r) => (server ? server.close(() => r()) : r())));

/** A pretend Datecs device on a local port: answers every command, SYN first to show it waits. */
function fakeDevice(answer: (cmd: number, data: string) => string) {
	const seen: { cmd: number; data: string }[] = [];
	return new Promise<{ port: number; seen: typeof seen }>((resolve) => {
		server = net.createServer((socket) => {
			socket.on('data', (chunk) => {
				const req = readRequest(chunk);
				seen.push({ cmd: req.cmd, data: req.data });
				socket.write(Buffer.from([0x16]));
				setTimeout(() => socket.write(replyFrame(req.seq, req.cmd, answer(req.cmd, req.data))), 5);
			});
		});
		server.listen(0, '127.0.0.1', () =>
			resolve({ port: (server!.address() as net.AddressInfo).port, seen })
		);
	});
}

describe('Datecs protocol', () => {
	it('frames and checks messages the way the device does', () => {
		const f = frame(0x21, CMD.status, 'W');
		expect(readRequest(f)).toEqual({ seq: 0x21, cmd: 0x4a, data: 'W' });
		const reply = parseReply(replyFrame(0x21, 0x4a, '1,2', [0x80, 0x80, 0x88, 0x80, 0x80, 0x80]));
		expect(reply).toMatchObject({ seq: 0x21, cmd: 0x4a, data: '1,2' });
		// A damaged byte fails the checksum.
		const bad = replyFrame(0x21, 0x4a, 'OK');
		bad[5] ^= 0x01;
		expect(() => parseReply(bad)).toThrow(/checksum|Malformed|status/);
		expect(statusError([0x81, 0x80, 0x80, 0x80, 0x80, 0x80])).toMatch(/syntax/);
		expect(statusError([0x80, 0x80, 0x81, 0x80, 0x80, 0x80])).toMatch(/paper/);
		expect(statusError([0x80, 0x80, 0x80, 0x80, 0x80, 0x80])).toBeNull();
		expect(deviceText('ሲሚንቶ OPC cement, 50 kg')).toBe('OPC cement  50 kg');
		expect(deviceText('PVC pipe ½″ × 6 m')).toBe('PVC pipe 1/2" x 6 m');
	});

	it('prints a receipt over TCP: open, sell, pay, close — and returns the FS No.', async () => {
		const device = await fakeDevice((cmd) => (cmd === CMD.closeReceipt ? '1523,00042' : ''));
		const conn = await DatecsConnection.connect('127.0.0.1', device.port, 2000);
		const printed = await printReceipt(conn, {
			operatorCode: '1',
			operatorPassword: '0000',
			till: 1,
			lines: [
				{ name: 'OPC cement 50 kg', quantity: 2, price: 1667.5, taxGroup: 'A' },
				{ name: 'Nails', quantity: 1.5, price: 145, taxGroup: 'B' }
			],
			payments: [{ code: 'P', amount: 3552.5 }],
			footer: 'BOL-ISS-2019-00009'
		});
		conn.close();

		expect(printed.fiscalNumber).toBe('00042');
		expect(device.seen.map((s) => s.cmd)).toEqual([0x30, 0x31, 0x31, 0x36, 0x35, 0x38]);
		expect(device.seen[0].data).toBe('1,0000,1');
		expect(device.seen[1].data).toBe('OPC cement 50 kg\tA1667.50*2.000');
		expect(device.seen[4].data).toBe('\tP3552.50');
	});

	it('cancels the receipt when a line is refused', async () => {
		const device = await fakeDevice(() => '');
		// Every sale line comes back with a syntax error.
		server!.removeAllListeners('connection');
		server!.on('connection', (socket) => {
			socket.on('data', (chunk) => {
				const req = readRequest(chunk);
				device.seen.push({ cmd: req.cmd, data: req.data });
				const status = req.cmd === CMD.sale ? [0x81, 0x80, 0x80, 0x80, 0x80, 0x80] : undefined;
				socket.write(replyFrame(req.seq, req.cmd, '', status));
			});
		});
		const conn = await DatecsConnection.connect('127.0.0.1', device.port, 2000);
		await expect(
			printReceipt(conn, {
				operatorCode: '1',
				operatorPassword: '0000',
				till: 1,
				lines: [{ name: 'X', quantity: 1, price: 1, taxGroup: 'A' }],
				payments: [{ code: 'P', amount: 1 }]
			})
		).rejects.toThrow(/syntax/);
		conn.close();
		expect(device.seen.map((s) => s.cmd)).toEqual([0x30, 0x31, 0x3c]);
	});

	it('maps tax rates to the device groups', () => {
		expect(parseTaxGroups(null)).toEqual({ '15': 'A', '0': 'B', exempt: 'C', tot: 'D' });
		expect(parseTaxGroups('15=V, 0=Z')).toEqual({ '15': 'V', '0': 'Z' });
	});
});

describe('TOT and the e-invoice payload', () => {
	it('adds TOT to sales of a business that is not VAT-registered, and the customer owes it', async () => {
		const r = await inRollback(async (tx) => {
			const { orgId, branchId } = await createOrganization(tx, { name: 'TOT shop' });
			await tx.update(organization).set({ totRate: 2 }).where(eq(organization.id, orgId));
			const [store] = await tx
				.select()
				.from(location)
				.where(and(eq(location.orgId, orgId), eq(location.kind, 'storage')));
			const [pcs] = await tx
				.select()
				.from(uom)
				.where(and(eq(uom.orgId, orgId), eq(uom.name, 'Piece')));
			const [sup] = await tx
				.insert(supplier)
				.values({ orgId, name: 'S', phone: '0911000000' })
				.$returningId();
			const [{ id: goods }] = await tx
				.insert(item)
				.values({ orgId, sku: 'G', name: 'Goods', baseUomId: pcs.id, supplierId: sup.id })
				.$returningId();
			// A service-like item taxed at its own 10%.
			const [{ id: labour }] = await tx
				.insert(item)
				.values({
					orgId,
					sku: 'L',
					name: 'Fitting',
					baseUomId: pcs.id,
					supplierId: sup.id,
					totRate: 10
				})
				.$returningId();
			const [buyer] = await tx.insert(customer).values({ orgId, name: 'Beza' }).$returningId();

			const post = async (
				type: 'receipt' | 'issue',
				lines: { itemId: number; q: number; p: number }[]
			) => {
				const [d] = await tx
					.insert(stockDocument)
					.values({
						orgId,
						branchId,
						type,
						docDate: '2026-09-29',
						...(type === 'receipt'
							? { toLocationId: store.id, supplierId: sup.id }
							: { fromLocationId: store.id, customerId: buyer.id })
					})
					.$returningId();
				for (const l of lines) {
					await tx.insert(stockDocumentLine).values({
						orgId,
						documentId: d.id,
						itemId: l.itemId,
						uomId: pcs.id,
						quantity: l.q,
						...(type === 'receipt' ? { unitCost: l.p } : { unitPrice: l.p })
					});
				}
				await postDocument(tx, { orgId, documentId: d.id, today: '2026-09-29' });
				return d.id;
			};
			await post('receipt', [
				{ itemId: goods, q: 10, p: 50 },
				{ itemId: labour, q: 10, p: 0 }
			]);
			const sale = await post('issue', [
				{ itemId: goods, q: 4, p: 100 },
				{ itemId: labour, q: 1, p: 200 }
			]);
			const lines = await tx
				.select({
					itemId: stockDocumentLine.itemId,
					totRate: stockDocumentLine.totRate,
					vatRate: stockDocumentLine.vatRate
				})
				.from(stockDocumentLine)
				.where(eq(stockDocumentLine.documentId, sale));
			const position = await customerStatement(orgId, buyer.id, { today: '2026-09-29' }, tx);
			return { lines, position, goods, labour };
		});

		expect(r.lines.find((l) => l.itemId === r.goods)).toMatchObject({ totRate: 2, vatRate: 0 });
		expect(r.lines.find((l) => l.itemId === r.labour)).toMatchObject({ totRate: 10 });
		// 400 + 2% = 408, and 200 + 10% = 220.
		expect(r.position.balance).toBe(628);
	});

	it('shapes a credit note with its original IRN and fiscal receipt', () => {
		const inv: Invoice = {
			documentId: 1,
			type: 'credit_note',
			number: 'BOL-SRN-2019-00001',
			issueDate: '2026-09-29',
			currency: 'ETB',
			seller: {
				tin: '0034567812',
				name: 'Shop',
				address: null,
				phone: null,
				vatRegistered: true,
				totPayer: false
			},
			buyer: { tin: '0023456781', name: 'Buyer', phone: null, address: null },
			fiscal: { fsNumber: '00042', machineCode: 'ABC1234567' },
			original: { number: 'BOL-ISS-2019-00001', irn: 'IRN-1' },
			lines: [
				{
					no: 1,
					sku: 'X',
					description: 'Thing',
					quantity: 2,
					unit: 'pcs',
					unitPrice: 100,
					net: 200,
					vatRate: 15,
					vat: 30,
					totRate: 0,
					tot: 0,
					total: 230
				}
			],
			totals: { net: 200, vat: 30, tot: 0, total: 230 }
		};
		const p = toProviderPayload(inv);
		expect(p).toMatchObject({
			invoiceType: 'CREDIT_NOTE',
			referenceIrn: 'IRN-1',
			fiscalReceipt: { fsNo: '00042', mrc: 'ABC1234567' },
			totals: { taxableAmount: 200, vatAmount: 30, totalAmount: 230 }
		});
		expect(p.items[0]).toMatchObject({ vatRate: 15, vatAmount: 30, lineTotal: 230 });
	});

	it('issues a sandbox e-invoice with an IRN and QR data, and keeps a typed-in FS No.', async () => {
		const r = await inRollback(async (tx) => {
			const { orgId, branchId } = await createOrganization(tx, { name: 'E-invoice shop' });
			await tx
				.update(organization)
				.set({ tin: '0034567812', vatRegistered: true, einvoiceMode: 'sandbox' })
				.where(eq(organization.id, orgId));
			const [store] = await tx
				.select()
				.from(location)
				.where(and(eq(location.orgId, orgId), eq(location.kind, 'storage')));
			const [pcs] = await tx
				.select()
				.from(uom)
				.where(and(eq(uom.orgId, orgId), eq(uom.name, 'Piece')));
			const [sup] = await tx
				.insert(supplier)
				.values({ orgId, name: 'S', phone: '0911000000' })
				.$returningId();
			const [{ id: thing }] = await tx
				.insert(item)
				.values({ orgId, sku: 'T', name: 'Thing', baseUomId: pcs.id, supplierId: sup.id })
				.$returningId();
			const make = async (type: 'receipt' | 'issue') => {
				const [d] = await tx
					.insert(stockDocument)
					.values({
						orgId,
						branchId,
						type,
						docDate: '2026-09-29',
						...(type === 'receipt'
							? { toLocationId: store.id, supplierId: sup.id }
							: { fromLocationId: store.id })
					})
					.$returningId();
				await tx.insert(stockDocumentLine).values({
					orgId,
					documentId: d.id,
					itemId: thing,
					uomId: pcs.id,
					quantity: 2,
					...(type === 'receipt' ? { unitCost: 50 } : { unitPrice: 100 })
				});
				await postDocument(tx, { orgId, documentId: d.id, today: '2026-09-29' });
				return d.id;
			};
			await make('receipt');
			const sale = await make('issue');
			const first = await submitEinvoice(orgId, sale, tx);
			const again = await submitEinvoice(orgId, sale, tx);
			await recordManualFiscal(orgId, sale, { fsNumber: '00017', machineCode: 'MRC-1' }, tx);
			const [doc] = await tx.select().from(stockDocument).where(eq(stockDocument.id, sale));
			return { first, again, doc };
		});

		expect(r.first).toMatchObject({ ok: true });
		const irn = (r.first as { irn: string }).irn;
		expect(irn).toMatch(/^SBX-[0-9A-F]{28}$/);
		// The same invoice gets the same number: a retry never makes a second one.
		expect(r.again).toEqual(r.first);
		expect(r.doc).toMatchObject({
			einvoiceStatus: 'accepted',
			einvoiceIrn: irn,
			fiscalReceiptNumber: '00017',
			fiscalMachineCode: 'MRC-1',
			fiscalStatus: 'manual'
		});
		// IRN | seller TIN | number | date | total (200 + 15% VAT).
		expect(r.doc.einvoiceQr).toMatch(
			new RegExp(`^${irn}\\|0034567812\\|.+\\|2026-09-29\\|230\\.00$`)
		);
	});
});
