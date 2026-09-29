import { beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { configureKit } from '@nahu/admin-kit/server/db';
import { inRollback } from '@nahu/admin-kit/server/testing/rollback';

import { db } from '$lib/server/db';
import { branch, roles, user, userBranch } from '$lib/server/db/schema';
import { createOrganization } from '$lib/server/seedPermissions';
import { inScope, scopeWhere } from './scope';
import { setUserBranches } from './users';

beforeAll(() => configureKit({ db }));

describe('branch scope', () => {
	it('lets everyone through when unscoped, and only the listed branches otherwise', () => {
		expect(inScope(null, 7)).toBe(true);
		expect(inScope([1, 2], 2)).toBe(true);
		expect(inScope([1, 2], 3)).toBe(false);
		expect(inScope([1, 2], null)).toBe(false);
		expect(scopeWhere(null, branch.id)).toBeUndefined();
		expect(scopeWhere([1], branch.id)).toBeDefined();
	});

	it("sets a user's branches, refusing another business's branch", async () => {
		const r = await inRollback(async (tx) => {
			const a = await createOrganization(tx, { name: 'Scope A' });
			const b = await createOrganization(tx, { name: 'Scope B' });
			const [second] = await tx
				.insert(branch)
				.values({ orgId: a.orgId, name: 'Second', code: 'SEC' })
				.$returningId();
			const [role] = await tx.select().from(roles).where(eq(roles.orgId, a.orgId)).limit(1);
			const id = `scope-${Math.random().toString(36).slice(2)}`;
			await tx.insert(user).values({
				id,
				name: 'Scoped',
				email: `${id}@example.com`,
				emailVerified: true,
				orgId: a.orgId,
				roleId: role.id
			});
			const rows = () =>
				tx
					.select({ branchId: userBranch.branchId })
					.from(userBranch)
					.where(eq(userBranch.userId, id));

			const ok = await setUserBranches(tx, a.orgId, id, [a.branchId, second.id, second.id]);
			const two = (await rows()).map((x) => x.branchId).sort();
			const foreign = await setUserBranches(tx, a.orgId, id, [b.branchId]);
			const kept = (await rows()).length;
			await setUserBranches(tx, a.orgId, id, []);
			const none = (await rows()).length;
			return { ok, two, foreign, kept, none, expected: [a.branchId, second.id].sort() };
		});
		expect(r.ok).toBe(true);
		expect(r.two).toEqual(r.expected);
		expect(r.foreign).toBe(false);
		expect(r.kept).toBe(2);
		expect(r.none).toBe(0);
	});
});
