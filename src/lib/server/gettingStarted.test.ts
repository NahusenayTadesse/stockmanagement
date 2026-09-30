import { beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { configureKit } from '@nahu/admin-kit/server/db';
import { inRollback } from '@nahu/admin-kit/server/testing/rollback';
import { db } from '$lib/server/db';
import { item, organization, supplier, uom } from '$lib/server/db/schema';
import { createOrganization } from '$lib/server/seedPermissions';
import { gettingStarted, setGuideHidden } from './gettingStarted';

beforeAll(() => configureKit({ db }));

describe('getting-started guide', () => {
	it('starts with nothing done and ticks steps from the business’s own data', async () => {
		const result = await inRollback(async (tx) => {
			const { orgId } = await createOrganization(tx, { name: 'Guide test shop' });
			const fresh = await gettingStarted(orgId, tx);

			const [pcs] = await tx.select().from(uom).where(eq(uom.orgId, orgId)).limit(1);
			const [sup] = await tx
				.insert(supplier)
				.values({ orgId, name: 'Supplier', phone: '0911000000' })
				.$returningId();
			await tx
				.insert(item)
				.values({ orgId, sku: 'X1', name: 'Thing', baseUomId: pcs.id, supplierId: sup.id });
			await tx
				.update(organization)
				.set({ address: 'Bole, Addis Ababa' })
				.where(eq(organization.id, orgId));
			const later = await gettingStarted(orgId, tx);

			await setGuideHidden(orgId, true, tx);
			const hidden = await gettingStarted(orgId, tx);
			await setGuideHidden(orgId, false, tx);
			const shown = await gettingStarted(orgId, tx);
			return { fresh, later, hidden, shown };
		});

		expect(result.fresh?.completed).toBe(0);
		expect(result.fresh?.steps.map((s) => s.id)).toEqual([
			'profile',
			'items',
			'suppliers',
			'stock',
			'sale',
			'staff',
			'subscription'
		]);
		const done = Object.fromEntries(result.later!.steps.map((s) => [s.id, s.done]));
		expect(done).toMatchObject({
			profile: true,
			items: true,
			suppliers: true,
			stock: false,
			sale: false
		});
		expect(result.later?.completed).toBe(3);
		expect(result.hidden).toBeNull();
		expect(result.shown?.completed).toBe(3);
	});
});
