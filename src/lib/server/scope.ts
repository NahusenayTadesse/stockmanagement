/**
 * Branch scoping: which branches a person sees and moves stock in.
 *
 * A user with rows in `user_branch` works in those branches only; one with none — or holding
 * `branches.all` — works everywhere. Owners hold every permission, so they always see everything.
 * Scoping narrows what someone is shown and may act on; it is checked on the server wherever a
 * branch's stock is read or moved, never trusted from a form.
 */
import { error } from '@sveltejs/kit';
import { and, eq, inArray, or, type SQL } from 'drizzle-orm';
import type { MySqlColumn } from 'drizzle-orm/mysql-core';
import { hasPermission } from '@nahu/admin-kit/server/permissions';
import { db } from '$lib/server/db';
import { location, userBranch } from '$lib/server/db/schema';

/** Null: every branch. Otherwise the branch ids this user works in. */
export type Scope = number[] | null;

const cache = new WeakMap<App.Locals, Promise<Scope>>();

export function branchScope(locals: App.Locals): Promise<Scope> {
	let scope = cache.get(locals);
	if (!scope) {
		scope = (async () => {
			const userId = locals.user?.id;
			if (!userId || !locals.orgId || hasPermission(locals, 'branches.all')) return null;
			const rows = await db
				.select({ branchId: userBranch.branchId })
				.from(userBranch)
				.where(and(eq(userBranch.userId, userId), eq(userBranch.orgId, locals.orgId)));
			return rows.length ? rows.map((r) => r.branchId) : null;
		})();
		cache.set(locals, scope);
	}
	return scope;
}

export function inScope(scope: Scope, branchId: number | null | undefined): boolean {
	return scope === null || (branchId != null && scope.includes(branchId));
}

/** A condition limiting a query to the scope, or nothing when it is every branch. */
export function scopeWhere(scope: Scope, ...columns: MySqlColumn[]): SQL | undefined {
	if (scope === null) return undefined;
	if (!scope.length) return eq(columns[0], -1);
	return or(...columns.map((c) => inArray(c, scope)));
}

/** 404 unless one of the branches is in the viewer's scope — to them, it does not exist. */
export async function requireBranch(
	locals: App.Locals,
	...branchIds: (number | null | undefined)[]
) {
	const scope = await branchScope(locals);
	if (!branchIds.some((b) => inScope(scope, b))) error(404, 'Not found');
}

/** The branch of each location, for checks on documents that name locations. */
export async function locationBranches(orgId: number, ids: (number | null | undefined)[]) {
	const wanted = ids.filter((id): id is number => !!id);
	if (!wanted.length) return new Map<number, number>();
	const rows = await db
		.select({ id: location.id, branchId: location.branchId })
		.from(location)
		.where(and(eq(location.orgId, orgId), inArray(location.id, wanted)));
	return new Map(rows.map((r) => [r.id, r.branchId]));
}
