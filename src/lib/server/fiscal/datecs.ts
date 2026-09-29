/**
 * The Datecs fiscal-printer protocol (the "legacy" framing used across the FP-/DP- families that
 * are common as MoR-registered sales registers), spoken over TCP to a networked device.
 *
 *   host → device   01 LEN SEQ CMD DATA 05 BCC 03
 *   device → host   01 LEN SEQ CMD DATA 04 STATUS(6) 05 BCC 03      (16h SYN while busy, 15h NAK)
 *
 * LEN is 20h + the byte count from LEN to 05 inclusive; BCC is the sum of those bytes, sent as
 * four nibbles each offset by 30h. Command numbers and data layouts follow the manufacturer's
 * programmer's manual for this protocol generation. Firmware differs by model and country — tax
 * group letters, payment types, text length — so those are settings, and anything new should be
 * tried against the actual device (Status and an X report are harmless) before a Z report.
 *
 * The framing is pure and unit-tested; `DatecsConnection` is the thin TCP part.
 */
import net from 'node:net';

export const CMD = {
	openReceipt: 0x30,
	sale: 0x31,
	subtotal: 0x33,
	total: 0x35,
	text: 0x36,
	closeReceipt: 0x38,
	cancelReceipt: 0x3c,
	dailyReport: 0x45,
	status: 0x4a,
	diagnostics: 0x5a
} as const;

const PRE = 0x01;
const PST = 0x05;
const EOT = 0x03;
const SEP = 0x04;
const NAK = 0x15;
const SYN = 0x16;

/** Text the device can print: its code page has no Ethiopic, so names are kept to ASCII. */
export function deviceText(text: string, max = 30) {
	return (
		text
			// Marks the device cannot print, made readable before anything else touches them
			// (NFKD would split ″ into two ′, and ½ into 1⁄2).
			.replace(/[\u2033\u201c\u201d]/g, '"')
			.replace(/[\u2032\u2018\u2019]/g, "'")
			.replace(/\u00d7/g, 'x')
			.normalize('NFKD')
			.replace(/\u2044/g, '/')
			.replace(/[^\x20-\x7e]/g, '')
			.replace(/[,\t]/g, ' ')
			.trim()
			.slice(0, max)
	);
}

function bcc(bytes: number[]) {
	const sum = bytes.reduce((s, b) => s + b, 0) & 0xffff;
	return [12, 8, 4, 0].map((shift) => ((sum >> shift) & 0x0f) + 0x30);
}

/** One request frame. `seq` runs 20h–7Fh; the reply echoes it. */
export function frame(seq: number, cmd: number, data = ''): Buffer {
	const body = [...Buffer.from(data, 'latin1')];
	if (body.length > 200) throw new Error('Datecs data is limited to 200 bytes.');
	const len = 0x20 + 4 + body.length; // LEN SEQ CMD DATA 05
	const counted = [len, seq, cmd, ...body, PST];
	return Buffer.from([PRE, ...counted, ...bcc(counted), EOT]);
}

export type Reply = { seq: number; cmd: number; data: string; status: number[] };

/** One reply frame, checked. Throws on a bad checksum or shape. */
export function parseReply(buf: Buffer): Reply {
	const start = buf.indexOf(PRE);
	const end = buf.lastIndexOf(EOT);
	if (start < 0 || end < start + 10) throw new Error('Incomplete reply from the device.');
	const bytes = [...buf.subarray(start, end + 1)];
	const pst = bytes.length - 6;
	if (bytes[pst] !== PST) throw new Error('Malformed reply from the device.');
	const counted = bytes.slice(1, pst + 1);
	const expected = bcc(counted);
	if (expected.some((b, i) => b !== bytes[pst + 1 + i]))
		throw new Error('Reply checksum mismatch.');
	const sep = bytes.indexOf(SEP, 4);
	if (sep < 0 || sep + 7 !== pst) throw new Error('Reply has no status block.');
	return {
		seq: bytes[2],
		cmd: bytes[3],
		data: Buffer.from(bytes.slice(4, sep)).toString('latin1'),
		status: bytes.slice(sep + 1, sep + 7)
	};
}

/** Builds a reply as a device would — for tests and a device simulator. */
export function replyFrame(
	seq: number,
	cmd: number,
	data: string,
	status = [0x80, 0x80, 0x80, 0x80, 0x80, 0x80]
) {
	const body = [...Buffer.from(data, 'latin1')];
	const len = 0x20 + 4 + body.length + 7; // LEN SEQ CMD DATA 04 STATUS(6) 05
	const counted = [len, seq, cmd, ...body, SEP, ...status, PST];
	return Buffer.from([PRE, ...counted, ...bcc(counted), EOT]);
}

/**
 * What the status bytes say went wrong, or null. Byte 0: bit 0 syntax error, bit 1 invalid
 * command, bit 5 general error; byte 2 bit 0 out of paper; byte 4 bit 0 fiscal memory error.
 */
export function statusError(status: number[]): string | null {
	const [s0, , s2, , s4] = status;
	if (s0 & 0x01) return 'the device reported a syntax error';
	if (s0 & 0x02) return 'the device does not know that command';
	if (s2 & 0x01) return 'the device is out of paper';
	if (s4 & 0x01) return 'the device reported a fiscal memory error';
	if (s0 & 0x20) return 'the device reported an error (general error flag)';
	return null;
}

/** A TCP session with one device. Commands run one at a time. */
export class DatecsConnection {
	private seq = 0x20;
	private constructor(
		private socket: net.Socket,
		private timeoutMs: number
	) {}

	static connect(host: string, port: number, timeoutMs = 8000): Promise<DatecsConnection> {
		return new Promise((resolve, reject) => {
			const socket = net.createConnection({ host, port });
			const fail = (err: Error) => {
				socket.destroy();
				reject(new Error(`Could not reach the fiscal device at ${host}:${port} (${err.message}).`));
			};
			socket.setTimeout(timeoutMs, () => fail(new Error('timed out')));
			socket.once('error', fail);
			socket.once('connect', () => {
				socket.removeListener('error', fail);
				resolve(new DatecsConnection(socket, timeoutMs));
			});
		});
	}

	/** Sends one command and waits for its reply, resending on NAK (up to 3 times). */
	async send(cmd: number, data = ''): Promise<Reply> {
		this.seq = this.seq >= 0x7f ? 0x20 : this.seq + 1;
		const request = frame(this.seq, cmd, data);
		for (let attempt = 0; attempt < 3; attempt++) {
			const raw = await this.exchange(request);
			if (raw === 'nak') continue;
			const reply = parseReply(raw);
			const problem = statusError(reply.status);
			if (problem) throw new Error(`Command ${cmd.toString(16)}h failed: ${problem}.`);
			return reply;
		}
		throw new Error('The fiscal device kept rejecting the message (NAK).');
	}

	private exchange(request: Buffer): Promise<Buffer | 'nak'> {
		return new Promise((resolve, reject) => {
			const chunks: Buffer[] = [];
			const timer = setTimeout(
				() => done(new Error('No reply from the fiscal device.')),
				this.timeoutMs
			);
			const onData = (chunk: Buffer) => {
				// SYN means "still working": wait, and give it the time again.
				if (chunk.length === 1 && chunk[0] === SYN) return timer.refresh();
				if (chunk.length === 1 && chunk[0] === NAK) return done(null, 'nak');
				chunks.push(chunk);
				const all = Buffer.concat(chunks);
				if (all.includes(EOT) && all.indexOf(PRE) >= 0) done(null, all);
			};
			const done = (err: Error | null, value?: Buffer | 'nak') => {
				clearTimeout(timer);
				this.socket.removeListener('data', onData);
				if (err) reject(err);
				else resolve(value!);
			};
			this.socket.on('data', onData);
			this.socket.write(request);
		});
	}

	close() {
		this.socket.end();
	}
}

export type ReceiptLine = { name: string; quantity: number; price: number; taxGroup: string };
export type ReceiptPayment = { code: string; amount: number };

const num = (n: number, digits = 2) => n.toFixed(digits);

/**
 * Prints one fiscal receipt and returns its fiscal receipt number (FS No.). Any failure after
 * opening cancels the receipt, so the device is never left with one half-printed.
 */
export async function printReceipt(
	conn: DatecsConnection,
	input: {
		operatorCode: string;
		operatorPassword: string;
		till: number;
		lines: ReceiptLine[];
		payments: ReceiptPayment[];
		footer?: string;
	}
): Promise<{ fiscalNumber: string; allReceipts: string }> {
	await conn.send(CMD.openReceipt, `${input.operatorCode},${input.operatorPassword},${input.till}`);
	try {
		for (const l of input.lines) {
			// <Text><TAB><TaxGroup><Price>*<Quantity>
			await conn.send(
				CMD.sale,
				`${deviceText(l.name)}\t${l.taxGroup}${num(l.price)}*${num(l.quantity, 3)}`
			);
		}
		if (input.footer) await conn.send(CMD.text, deviceText(input.footer, 36));
		for (const p of input.payments) {
			await conn.send(CMD.total, `\t${p.code}${num(p.amount)}`);
		}
		const closed = await conn.send(CMD.closeReceipt);
		const [allReceipts, fiscalNumber] = closed.data.split(',');
		return {
			fiscalNumber: (fiscalNumber ?? allReceipts ?? '').trim(),
			allReceipts: allReceipts?.trim() ?? ''
		};
	} catch (err) {
		await conn.send(CMD.cancelReceipt).catch(() => undefined);
		throw err;
	}
}
