import { int, type AnyMySqlColumn } from 'drizzle-orm/mysql-core';
import { fieldMixins } from '@nahu/admin-kit/server/schema';
import { organization, user } from './auth';

/** The kit's column sets, bound to this app's `user` table. See `fieldMixins`. */
export const { deletionFields, secureFields, lesserFields, approvalFields } = fieldMixins(
	() => user.id
);

/**
 * The tenant column every business table carries. `cascade`: removing an organization removes
 * everything it owns, and nothing else ever points across tenants.
 */
export const orgRef = () =>
	int('org_id')
		.notNull()
		.references((): AnyMySqlColumn => organization.id, { onDelete: 'cascade' });
