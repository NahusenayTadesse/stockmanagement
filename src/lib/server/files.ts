import fs from 'node:fs';
import { resolveStoredFile } from '@nahu/admin-kit/server/files';

/**
 * Deletes a stored upload from disk. For files that nothing will ever reference again — a replaced
 * logo. Attachments are soft-deleted instead and keep their file, because the record of what was
 * submitted is the point of them.
 */
export function removeStoredFile(name: string | null | undefined) {
	if (!name) return;
	const target = resolveStoredFile(name);
	if (target) fs.rmSync(target, { force: true });
}
