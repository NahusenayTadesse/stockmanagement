/**
 * The business's own row, as the settings screens (business profile, SMS) read and change it:
 * every change in one transaction with its audit entry, so no screen can save without one.
 */
import { eq } from 'drizzle-orm';
import type { AuditRequest } from '@nahu/admin-kit/server/audit';
import { recordAudit } from '@nahu/admin-kit/server/audit';
import { db } from '$lib/server/db';
import { organization } from '$lib/server/db/schema';
import type { Tx } from '$lib/server/stock/ledger';

type Organization = typeof organization.$inferSelect;
type Values = Partial<typeof organization.$inferInsert>;

export async function currentOrganization(orgId: number): Promise<Organization> {
	const [org] = await db.select().from(organization).where(eq(organization.id, orgId));
	return org;
}

/**
 * Writes `values` and records them against `before` (the row as it was). `redact` names secrets
 * the audit trail only says are set; `also` runs in the same transaction, after the write.
 */
export async function updateOrganization(
	event: AuditRequest,
	before: Organization,
	values: Values,
	options: { redact?: (keyof Organization)[]; also?: (tx: Tx) => Promise<unknown> } = {}
) {
	const hide = (row: Record<string, unknown>) =>
		Object.fromEntries(
			Object.keys(values).map((key) => [
				key,
				options.redact?.includes(key as keyof Organization) ? (row[key] ? '(set)' : null) : row[key]
			])
		);
	await db.transaction(async (tx) => {
		await tx.update(organization).set(values).where(eq(organization.id, before.id));
		await options.also?.(tx);
		await recordAudit(tx, event, {
			table: 'organization',
			recordId: before.id,
			action: 'update',
			before: hide(before),
			after: hide(values)
		});
	});
}
