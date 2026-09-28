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
		{ prefix: '/dashboard/admin-panel/users', permission: 'users.manage' },
		{ prefix: '/dashboard/admin-panel/roles', permission: 'roles.manage' },
		{ prefix: '/dashboard/admin-panel/business', permission: 'business.manage' },
		{ prefix: '/dashboard/admin-panel', permission: 'settings.manage' },
		{ prefix: '/dashboard/items', permission: 'items.view' },
		{ prefix: '/dashboard/lots', permission: 'stock.view' },
		{ prefix: '/dashboard/stock', permission: 'stock.view' },
		{ prefix: '/dashboard/suppliers', permission: 'suppliers.view' },
		{ prefix: '/dashboard/purchasing', permission: 'purchasing.view' },
		{ prefix: '/dashboard/reports', permission: 'reports.view' },
		{ prefix: '/dashboard/transactions', permission: 'transactions.view' }
	]
});
