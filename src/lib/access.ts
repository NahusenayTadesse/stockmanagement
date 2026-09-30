import { createAccess } from '@nahu/admin-kit/access';

/**
 * Who may open what: one rule per route prefix, first match wins, so specific prefixes go before
 * general ones. Pages under /dashboard with no rule are closed — add a rule with every new page.
 * `permission: null` means any signed-in user.
 *
 * The permission names here are also what `$lib/server/seedPermissions` seeds into the
 * `permissions` table, together with the code-only ones listed there.
 */
export const access = createAccess({
	root: '/dashboard',
	rules: [
		{ prefix: '/dashboard', permission: null, exact: true },
		{ prefix: '/dashboard/files/', permission: null },
		{ prefix: '/dashboard/change-password', permission: null },
		// Open to everyone in the business: it is where a blocked business lands. Paying and the
		// payment history need `subscription.manage`, checked on the page.
		{ prefix: '/dashboard/subscription', permission: null },
		{ prefix: '/dashboard/admin-panel/users', permission: 'users.manage' },
		{ prefix: '/dashboard/admin-panel/roles', permission: 'roles.manage' },
		{ prefix: '/dashboard/admin-panel/business', permission: 'business.manage' },
		{ prefix: '/dashboard/admin-panel/import', permission: 'data.import' },
		{ prefix: '/dashboard/admin-panel/sms', permission: 'business.manage' },
		{ prefix: '/dashboard/admin-panel', permission: 'settings.manage' },
		{ prefix: '/dashboard/items', permission: 'items.view' },
		{ prefix: '/dashboard/lots', permission: 'stock.view' },
		{ prefix: '/dashboard/stock', permission: 'stock.view' },
		{ prefix: '/dashboard/requisitions', permission: 'requisitions.view' },
		{ prefix: '/dashboard/approvals', permission: 'approvals.view' },
		{ prefix: '/dashboard/suppliers', permission: 'suppliers.view' },
		{ prefix: '/dashboard/customers', permission: 'customers.view' },
		{ prefix: '/dashboard/pos', permission: 'pos.use' },
		{ prefix: '/dashboard/sales', permission: 'sales.view' },
		{ prefix: '/dashboard/purchasing', permission: 'purchasing.view' },
		{ prefix: '/dashboard/reports', permission: 'reports.view' },
		{ prefix: '/dashboard/transactions', permission: 'transactions.view' }
	]
});

/**
 * The site admin (`/admin`): Digital Construct's own console over every business's subscription.
 * Not a permission a business can grant — `hooks.server.ts` opens it to users flagged
 * `siteAdmin` and to nobody else — so it is kept apart from the rules above, which are what
 * `seedPermissions` turns into grantable permissions.
 */
export const SITE_ADMIN = 'site.admin';
export const adminAccess = createAccess({
	root: '/admin',
	rules: [{ prefix: '/admin', permission: SITE_ADMIN }]
});
