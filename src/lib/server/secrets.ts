/**
 * Credentials a business stores with us — its e-invoicing client secret, a fiscal bridge token, a
 * device operator password — kept encrypted at rest (AES-256-GCM). The key is derived from
 * `SECRETS_KEY`, or failing that `BETTER_AUTH_SECRET`; rotating it makes stored values unreadable,
 * and they must be entered again.
 *
 * Sealed values never go to the browser: forms show whether one is set, not what it is.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { env } from '$env/dynamic/private';

const PREFIX = 'v1:';

function key() {
	const secret = env.SECRETS_KEY || env.BETTER_AUTH_SECRET;
	if (!secret) throw new Error('Set SECRETS_KEY (or BETTER_AUTH_SECRET) to store credentials.');
	return createHash('sha256').update(`stock-management/secrets:${secret}`).digest();
}

/** Encrypts a value for storage. Empty stays empty. */
export function seal(plain: string | null | undefined): string | null {
	if (!plain) return null;
	const iv = randomBytes(12);
	const cipher = createCipheriv('aes-256-gcm', key(), iv);
	const body = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
	return PREFIX + Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64');
}

/** Decrypts a stored value; null if empty or unreadable (tampered, or the key changed). */
export function unseal(sealed: string | null | undefined): string | null {
	if (!sealed?.startsWith(PREFIX)) return null;
	try {
		const raw = Buffer.from(sealed.slice(PREFIX.length), 'base64');
		const decipher = createDecipheriv('aes-256-gcm', key(), raw.subarray(0, 12));
		decipher.setAuthTag(raw.subarray(12, 28));
		return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8');
	} catch {
		return null;
	}
}
