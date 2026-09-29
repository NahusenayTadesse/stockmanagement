import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { message, setError, superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { redirect } from 'sveltekit-flash-message/server';
import { hasPermission, requirePermission } from '@nahu/admin-kit/server/permissions';
import { localToday } from '@nahu/admin-kit/time';
import { db } from '$lib/server/db';
import {
	category,
	location,
	stockCount,
	stockCountLine,
	stockDocument,
	user
} from '$lib/server/db/schema';
import { qualified } from '$lib/server/db/sql';
import { orgIdOf } from '$lib/server/tenant';
import { branchScope, inScope, scopeWhere } from '$lib/server/scope';
import { categoryOptions, locationOptions } from '$lib/server/options';
import { openCount } from '$lib/server/counts';
import { StockError } from '$lib/server/stock/post';
import { countOpen } from '$lib/schemas/counts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const orgId = orgIdOf(locals);
	const scope = await branchScope(locals);
	const line = qualified(stockCount, stockCount.id);
	const [counts, locations, categories, form] = await Promise.all([
		db
			.select({
				id: stockCount.id,
				status: stockCount.status,
				countDate: stockCount.countDate,
				location: location.name,
				category: category.name,
				blind: stockCount.blind,
				lines: sql<number>`(SELECT COUNT(*) FROM ${stockCountLine} WHERE ${stockCountLine.countId} = ${line})`,
				counted: sql<number>`(SELECT COUNT(*) FROM ${stockCountLine} WHERE ${stockCountLine.countId} = ${line} AND ${stockCountLine.counted} IS NOT NULL)`,
				differences: sql<number>`(SELECT COUNT(*) FROM ${stockCountLine} WHERE ${stockCountLine.countId} = ${line} AND ${stockCountLine.counted} IS NOT NULL AND ${stockCountLine.counted} <> ${stockCountLine.expected})`,
				adjustmentId: stockCount.adjustmentId,
				adjustment: stockDocument.number,
				openedBy: user.name
			})
			.from(stockCount)
			.innerJoin(location, eq(location.id, stockCount.locationId))
			.leftJoin(category, eq(category.id, stockCount.categoryId))
			.leftJoin(stockDocument, eq(stockDocument.id, stockCount.adjustmentId))
			.leftJoin(user, eq(user.id, stockCount.createdBy))
			.where(
				and(
					eq(stockCount.orgId, orgId),
					isNull(stockCount.deletedAt),
					scopeWhere(scope, stockCount.branchId)
				)
			)
			.orderBy(desc(stockCount.id)),
		locationOptions(orgId, scope),
		categoryOptions(orgId),
		superValidate({ countDate: localToday(), blind: true }, zod4(countOpen), { errors: false })
	]);
	return {
		counts: counts.map((c) => ({
			...c,
			lines: Number(c.lines),
			counted: Number(c.counted),
			differences: Number(c.differences)
		})),
		locations,
		categories: [{ value: 0, name: 'Everything at the location' }, ...categories],
		form,
		canCount: hasPermission(locals, 'stock.draft')
	};
};

export const actions: Actions = {
	open: async (event) => {
		requirePermission(event.locals, 'stock.draft');
		const orgId = orgIdOf(event.locals);
		const form = await superValidate(event.request, zod4(countOpen));
		if (!form.valid)
			return message(form, { type: 'error', text: 'Please check the form' }, { status: 400 });

		// Only a location in the viewer's branches, and never the system's transit locations.
		const [loc] = await db
			.select({ branchId: location.branchId, kind: location.kind })
			.from(location)
			.where(and(eq(location.id, form.data.locationId), eq(location.orgId, orgId)));
		if (!loc || loc.kind === 'transit' || !inScope(await branchScope(event.locals), loc.branchId)) {
			setError(form, 'locationId', 'Choose a location from the list.');
			return message(
				form,
				{ type: 'error', text: 'Choose a location from the list.' },
				{ status: 400 }
			);
		}

		let id: number;
		try {
			id = await db.transaction((tx) =>
				openCount(tx, {
					orgId,
					locationId: form.data.locationId,
					categoryId: form.data.categoryId || null,
					blind: form.data.blind,
					countDate: form.data.countDate,
					note: form.data.note || null,
					userId: event.locals.user?.id
				})
			);
		} catch (err) {
			if (err instanceof StockError) {
				setError(form, 'locationId', err.message);
				return message(form, { type: 'error', text: err.message }, { status: 409 });
			}
			throw err;
		}
		redirect(
			`/dashboard/stock/counts/${id}`,
			{ type: 'success', message: `Count #${id} opened — enter what is on the shelf` },
			event.cookies
		);
	}
};
