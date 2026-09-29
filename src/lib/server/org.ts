/**
 * A row of the viewer's business. Every "this business's X by id" lookup goes through here, so
 * each one filters by the business (and skips soft-deleted rows) the same way — a row id from
 * another business, or a deleted row, is simply not found.
 */
import { error } from '@sveltejs/kit';
import { and, eq, isNull, type InferSelectModel } from 'drizzle-orm';
import type { AnyMySqlColumn, MySqlTable } from 'drizzle-orm/mysql-core';
import { db } from '$lib/server/db';

type Reader = Pick<typeof db, 'select'>;
type OrgTable = MySqlTable & {
	id: AnyMySqlColumn;
	orgId: AnyMySqlColumn;
	deletedAt?: AnyMySqlColumn;
};

/** The row with this id, if it is this business's and not deleted. */
export async function orgRow<T extends OrgTable>(
	table: T,
	orgId: number,
	id: number,
	reader: Reader = db
): Promise<InferSelectModel<T> | undefined> {
	const rows = await reader
		.select()
		.from(table as MySqlTable)
		.where(
			and(
				eq(table.id, id),
				eq(table.orgId, orgId),
				table.deletedAt ? isNull(table.deletedAt) : undefined
			)
		)
		.limit(1);
	return rows[0] as InferSelectModel<T> | undefined;
}

/** The same, or a 404 whose message is `notFound()`. */
export async function orgRowOr404<T extends OrgTable>(
	table: T,
	orgId: number,
	id: number,
	notFound: () => string,
	reader: Reader = db
): Promise<InferSelectModel<T>> {
	const row = await orgRow(table, orgId, id, reader);
	if (!row) error(404, notFound());
	return row;
}
