import { error, type RequestEvent } from '@sveltejs/kit';
import { childCrud, type ChildCrudOptions } from '@nahu/admin-kit/server/childCrud';

/**
 * The viewer's organization. Set in `hooks.server.ts` from the user row — never from the URL,
 * a cookie or a form — so it is the one value every tenant-scoped query can trust.
 */
export function orgIdOf(locals: App.Locals): number {
	if (!locals.orgId) error(403, 'Your account is not attached to a business.');
	return locals.orgId;
}

/**
 * The kit's `childCrud`, with the organization as the owner.
 *
 * `childCrud` already does what a tenant table needs: every read is filtered by the owner, the
 * owner id is stamped on insert from the server, and edits and deletes match the owner as well
 * as the row id, so a row id from another business matches nothing. Using it with `orgId` as the
 * owner column is the whole of tenant scoping for simple lists.
 *
 * Returns the `load`/`actions` shape `LookupPage` expects (`?/add`, `?/edit`, `?/delete`).
 */
export function orgCrud(options: Omit<ChildCrudOptions, 'ownerColumn'>) {
	const crud = childCrud({ ...options, ownerColumn: 'orgId' });

	return {
		load: (event: Pick<RequestEvent, 'locals'>) => crud.load(orgIdOf(event.locals)),
		actions: {
			add: (event: RequestEvent) => crud.actions.add(event, orgIdOf(event.locals)),
			edit: (event: RequestEvent) => crud.actions.edit(event, orgIdOf(event.locals)),
			delete: (event: RequestEvent) => crud.actions.delete(event, orgIdOf(event.locals))
		}
	};
}
