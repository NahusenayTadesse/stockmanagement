import { env } from '$env/dynamic/private';
import { m } from '$lib/paraglide/messages.js';
import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

/**
 * Outgoing mail. Ported from content-svelte, which runs on the same SMTP account.
 *
 * Nothing here throws: a message is a side effect of something that already happened (the reset
 * link was issued, the digest was built), and a mail server being down must not turn into a
 * failed form. `sendMail` resolves to whether the server took the message.
 */

const host = env.SMTP_HOST;
const port = Number(env.SMTP_PORT || 465);
const user = env.SMTP_USER;
const pass = env.SMTP_PASSWORD;

/** All three are needed; half a configuration fails one message at a time instead of at start-up. */
export const mailEnabled = Boolean(host && user && pass && Number.isFinite(port));

const from = env.SMTP_FROM || user || '';

let transport: Transporter | null = null;
let warned = false;

function getTransport(): Transporter | null {
	if (!mailEnabled) return null;
	transport ??= nodemailer.createTransport({
		host,
		port,
		// 465 is implicit TLS; anything else starts in the clear and upgrades.
		secure: port === 465,
		requireTLS: port !== 465,
		auth: { user, pass },
		// The certificate is checked against this name when it differs from the host's — shared
		// hosting's mail box carries the provider's certificate. Verification stays fully on.
		tls: env.SMTP_TLS_SERVERNAME ? { servername: env.SMTP_TLS_SERVERNAME } : undefined,
		pool: true,
		maxConnections: 2,
		connectionTimeout: 15_000,
		greetingTimeout: 15_000
	});
	return transport;
}

/** Words and at most one button — never caller-supplied HTML. */
export type MailContent = {
	subject: string;
	heading?: string;
	/** Paragraphs, plain text, escaped on the way in. */
	body: string[];
	action?: { label: string; url: string };
	/** A small table, e.g. the lots in an expiry digest. Plain text cells. */
	table?: { head: string[]; rows: string[][] };
	footnote?: string;
};

const escape = (value: string) =>
	value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function render(content: MailContent, siteName: string) {
	const heading = content.heading ?? content.subject;
	const paragraphs = content.body.filter(Boolean);
	const table = content.table;

	const text = [
		heading,
		'',
		...paragraphs,
		...(table ? ['', table.head.join(' | '), ...table.rows.map((r) => r.join(' | '))] : []),
		...(content.action ? ['', `${content.action.label}: ${content.action.url}`] : []),
		...(content.footnote ? ['', content.footnote] : []),
		'',
		'—',
		siteName
	].join('\n');

	const cell = 'padding:6px 8px;border-bottom:1px solid #eeeeee;font-size:13px;text-align:left;';
	const tableHtml = table
		? `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:8px 0 16px;border-collapse:collapse;">
<tr>${table.head.map((h) => `<th style="${cell}color:#666666;font-weight:700;">${escape(h)}</th>`).join('')}</tr>
${table.rows.map((r) => `<tr>${r.map((c) => `<td style="${cell}color:#222222;">${escape(c)}</td>`).join('')}</tr>`).join('\n')}
</table>`
		: '';

	const html = `<!doctype html>
<html><body style="margin:0;padding:24px;background:#f4f4f2;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;">
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:600px;margin:0 auto;background:#ffffff;border:1px solid #dddddd;border-radius:12px;">
<tr><td style="padding:28px 28px 8px;">
<p style="margin:0 0 18px;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#666666;">${escape(siteName)}</p>
<h1 style="margin:0 0 16px;font-size:20px;font-weight:700;color:#111111;">${escape(heading)}</h1>
${paragraphs.map((p) => `<p style="margin:0 0 14px;font-size:14px;line-height:1.6;color:#333333;">${escape(p)}</p>`).join('\n')}
${tableHtml}
${
	content.action
		? `<p style="margin:24px 0 8px;"><a href="${escape(content.action.url)}" style="display:inline-block;padding:12px 20px;background:#1e40af;color:#ffffff;text-decoration:none;border-radius:8px;font-size:14px;font-weight:700;">${escape(content.action.label)}</a></p>
<p style="margin:0 0 8px;font-size:11px;line-height:1.5;color:#888888;word-break:break-all;">${escape(content.action.url)}</p>`
		: ''
}
${content.footnote ? `<p style="margin:18px 0 0;font-size:12px;line-height:1.5;color:#777777;">${escape(content.footnote)}</p>` : ''}
</td></tr>
<tr><td style="padding:16px 28px 24px;border-top:1px solid #eeeeee;">
<p style="margin:0;font-size:11px;color:#999999;">${escape(siteName)} · ${escape(m.sales_mail_prepared_by())}</p>
</td></tr>
</table>
</body></html>`;

	return { text, html };
}

export async function sendMail(
	to: string | null | undefined,
	content: MailContent,
	siteName = 'Stock management'
): Promise<boolean> {
	if (!to) return false;

	const mailer = getTransport();
	if (!mailer) {
		if (!warned) {
			warned = true;
			console.warn('[mail] SMTP is not configured — no mail will be sent.');
		}
		return false;
	}

	const { text, html } = render(content, siteName);
	try {
		await mailer.sendMail({ from, to, subject: content.subject, text, html });
		return true;
	} catch (err) {
		// The recipient is logged; the body is not.
		console.error(`[mail] send to ${to} failed:`, err instanceof Error ? err.message : err);
		return false;
	}
}

/** Connects and authenticates without sending — for checking the configuration. */
export async function verifyMail(): Promise<{ ok: boolean; error?: string }> {
	const mailer = getTransport();
	if (!mailer) return { ok: false, error: 'SMTP is not configured.' };
	try {
		await mailer.verify();
		return { ok: true };
	} catch (err) {
		return { ok: false, error: err instanceof Error ? err.message : String(err) };
	}
}
