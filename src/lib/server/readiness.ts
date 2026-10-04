import { createHash } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import journal from '../../../drizzle/meta/_journal.json';

const migrations = import.meta.glob('/drizzle/*.sql', { query: '?raw', import: 'default', eager: true });
export const requiredMigrations = journal.entries.map((entry) => {
	const source = migrations[`/drizzle/${entry.tag}.sql`];
	if (typeof source !== 'string') throw new Error(`Missing migration: ${entry.tag}`);
	return createHash('sha256').update(source).digest('hex');
});

export function migrationsReady(applied: Iterable<string>, required = requiredMigrations): boolean {
	const hashes = new Set(applied);
	return required.every((hash) => hashes.has(hash));
}

export async function schemaReady(): Promise<boolean> {
	const [rows] = await db.execute(sql`SELECT hash FROM __drizzle_migrations`);
	return migrationsReady((rows as unknown as { hash: string }[]).map((r) => r.hash));
}
