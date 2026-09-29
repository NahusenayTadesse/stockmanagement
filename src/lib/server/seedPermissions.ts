import { eq, inArray, sql } from 'drizzle-orm';
import type { Writer } from '@nahu/admin-kit/server/db';
import {
	branch,
	location,
	organization,
	paymentMethod,
	permissions,
	rolePermissions,
	roles,
	uom
} from '$lib/server/db/schema';
import { access } from '$lib/access';
import type { Tx } from '$lib/server/stock/post';

/**
 * The permissions the system recognises, the roles a new business starts with, and the setup of a
 * new business. Carried over from dentalClinic, made per-organization.
 */

/**
 * Permissions enforced in code rather than by a route prefix. Everything else is read off the
 * route rules in `$lib/access`, so a new gated route cannot ship with a permission nobody can be
 * granted.
 */
const CODE_ONLY_PERMISSIONS = [
	'items.manage',
	'stock.draft',
	'stock.post',
	'lots.manage',
	'transactions.manage',
	'transactions.verify',
	'suppliers.manage',
	'customers.manage',
	'customers.credit',
	'purchasing.manage',
	'sales.manage',
	'sales.discount',
	'pos.manage',
	'branches.all',
	'requisitions.request',
	'requisitions.approve',
	'approvals.decide'
] as const;

/** Wording for the permission checklist on the role and user screens. */
export const DESCRIPTIONS: Record<string, string> = {
	'settings.manage': 'Maintain branches, locations, categories and units',
	'business.manage': 'Change the business name, TIN, contact details and logo',
	'suppliers.view': 'See suppliers, what they delivered, and what is owed to them',
	'suppliers.manage': 'Add suppliers and change their details',
	'customers.view': 'See customers, what they took and what they paid',
	'customers.manage': 'Add customers and change their details, including credit limits',
	'customers.credit': 'Post a sale that takes a customer over their credit limit',
	'pos.use': 'Sell at the till (POS): open a shift, ring up sales, take payments',
	'pos.manage': "See every till shift, and close someone else's",
	'sales.view': 'See sales, invoices and proformas',
	'sales.manage': 'Write proformas, send them, and turn them into sales',
	'sales.discount': 'Give discounts above the limit, and change prices freely',
	'purchasing.view': 'See purchase orders and what needs reordering',
	'purchasing.manage': 'Draft purchase orders, send them to suppliers, close and cancel them',
	'reports.view': 'Read the stock, purchase, wastage and money reports, and export them',
	'users.manage': 'Create and manage user accounts',
	'roles.manage': 'Create roles and decide what they may do',
	'items.view': 'See the item catalogue',
	'items.manage': 'Add and change items, their units and barcodes',
	'stock.view': 'See stock on hand, lots, and stock documents',
	'stock.draft': 'Prepare receipts, issues, transfers and adjustments',
	'stock.post': 'Post stock documents, which changes stock, or cancel drafts',
	'lots.manage': 'Quarantine, recall and release lots',
	'transactions.view': 'See every transaction, with totals of money in and out',
	'transactions.manage': 'Record payments and receipts, attach screenshots and PDFs, void mistakes',
	'transactions.verify':
		'Mark a transaction verified after checking the bank or Telebirr statement',
	'branches.all':
		'Work in every branch, whatever branches the user is assigned (without it, assigned branches only)',
	'requisitions.view': 'See requisitions: what departments asked the store for',
	'requisitions.request': "Write and submit requisitions for a department's needs",
	'requisitions.approve': 'Approve (or cut, or reject) requisitions, and issue what was approved',
	'approvals.view': 'See what is waiting for approval, and what was decided',
	'approvals.decide':
		'Approve or reject large adjustments, write-offs, count differences and purchase orders',
	'data.import': 'Import items, suppliers, customers and opening stock from a spreadsheet'
};

/** Every permission the system recognises, in a stable order. */
export function permissionNames(): string[] {
	const fromRoutes = access.rules
		.map((rule) => rule.permission)
		.filter((name): name is string => name !== null);
	return [...new Set([...fromRoutes, ...CODE_ONLY_PERMISSIONS])].sort();
}

/** Permissions without wording — a test keeps this empty. */
export function permissionsMissingDescriptions(): string[] {
	return permissionNames().filter((name) => !DESCRIPTIONS[name]);
}

/**
 * The roles every new business starts with. They are ordinary rows afterwards: the business may
 * rename them, change what they hold, or delete them — except the owner role.
 */
export const DEFAULT_ROLES: { name: string; description: string; permissions: string[] | 'all' }[] =
	[
		{ name: 'Owner', description: 'Holds every permission', permissions: 'all' },
		{
			name: 'Manager',
			description: 'Runs the stores: settings, items, and posting',
			permissions: [
				'settings.manage',
				'items.view',
				'items.manage',
				'stock.view',
				'stock.draft',
				'stock.post',
				'lots.manage',
				'transactions.view',
				'transactions.manage',
				'transactions.verify',
				'suppliers.view',
				'suppliers.manage',
				'customers.view',
				'customers.manage',
				'customers.credit',
				'pos.use',
				'pos.manage',
				'sales.view',
				'sales.manage',
				'sales.discount',
				'purchasing.view',
				'purchasing.manage',
				'reports.view',
				'branches.all',
				'requisitions.view',
				'requisitions.request',
				'requisitions.approve',
				'approvals.view',
				'approvals.decide',
				'data.import'
			]
		},
		{
			name: 'Cashier',
			description: 'Records the money: payments to suppliers, takings, expenses',
			permissions: [
				'items.view',
				'stock.view',
				'transactions.view',
				'transactions.manage',
				'suppliers.view',
				'customers.view',
				'customers.manage',
				'pos.use',
				'sales.view',
				'purchasing.view',
				'reports.view'
			]
		},
		{
			name: 'Storekeeper',
			description: 'Receives, issues and moves stock',
			permissions: [
				'items.view',
				'stock.view',
				'stock.draft',
				'stock.post',
				'suppliers.view',
				'suppliers.manage',
				'customers.view',
				'purchasing.view',
				'reports.view',
				'requisitions.view',
				'approvals.view'
			]
		},
		{
			name: 'Clerk',
			description: 'Prepares documents, and records the payments that go with them',
			permissions: [
				'items.view',
				'stock.view',
				'stock.draft',
				'transactions.manage',
				'suppliers.view',
				'suppliers.manage',
				'customers.view',
				'customers.manage',
				'sales.view',
				'sales.manage',
				'purchasing.view',
				'requisitions.view',
				'requisitions.request',
				'approvals.view'
			]
		},
		{
			name: 'Department',
			description: 'Asks the store for what a department, ward or site needs',
			permissions: ['items.view', 'requisitions.view', 'requisitions.request']
		},
		{
			name: 'Viewer',
			description: 'Reads stock and items, changes nothing',
			permissions: [
				'items.view',
				'stock.view',
				'suppliers.view',
				'customers.view',
				'sales.view',
				'purchasing.view',
				'reports.view'
			]
		}
	];

/** The units a new business starts with, chosen for what Ethiopian shops actually count in. */
export const DEFAULT_UNITS: { name: string; symbol: string }[] = [
	{ name: 'Piece', symbol: 'pcs' },
	{ name: 'Box', symbol: 'box' },
	{ name: 'Carton', symbol: 'ctn' },
	{ name: 'Pack', symbol: 'pk' },
	{ name: 'Dozen', symbol: 'dz' },
	{ name: 'Tablet', symbol: 'tab' },
	{ name: 'Capsule', symbol: 'cap' },
	{ name: 'Strip', symbol: 'strip' },
	{ name: 'Ampoule', symbol: 'amp' },
	{ name: 'Sachet', symbol: 'sachet' },
	{ name: 'Tube', symbol: 'tube' },
	{ name: 'Bottle', symbol: 'btl' },
	{ name: 'Vial', symbol: 'vial' },
	{ name: 'Kilogram', symbol: 'kg' },
	{ name: 'Gram', symbol: 'g' },
	{ name: 'Quintal (ኩንታል)', symbol: 'qt' },
	{ name: 'Litre', symbol: 'L' },
	{ name: 'Millilitre', symbol: 'mL' },
	{ name: 'Jerrycan', symbol: 'jrc' },
	{ name: 'Metre', symbol: 'm' },
	{ name: 'Sack', symbol: 'sack' }
];

/** How money moves in Ethiopia, as a new business's starting list. */
export const DEFAULT_PAYMENT_METHODS: {
	name: string;
	kind: (typeof paymentMethod.$inferInsert)['kind'];
}[] = [
	{ name: 'Cash', kind: 'cash' },
	{ name: 'Telebirr', kind: 'mobile_money' },
	{ name: 'CBE Birr', kind: 'mobile_money' },
	{ name: 'M-Pesa', kind: 'mobile_money' },
	{ name: 'Bank transfer — CBE', kind: 'bank' },
	{ name: 'Bank transfer — other bank', kind: 'bank' },
	{ name: 'Cheque', kind: 'cheque' }
];

/**
 * Gives every business that has no payment methods the default list. For businesses created
 * before payment methods existed; runs at boot next to `seedPermissions`, and does nothing once
 * each business has at least one.
 */
export async function seedPaymentMethods(db: Writer): Promise<number> {
	const orgs = await db
		.select({ id: organization.id })
		.from(organization)
		.where(
			sql`NOT EXISTS (SELECT 1 FROM ${paymentMethod} WHERE ${paymentMethod.orgId} = ${organization.id})`
		);
	for (const org of orgs) {
		await db
			.insert(paymentMethod)
			.values(DEFAULT_PAYMENT_METHODS.map((m) => ({ ...m, orgId: org.id })));
	}
	return orgs.length;
}

/**
 * Brings the `permissions` table up to date with the code, and grants every permission to every
 * owner role. Runs once per boot (see `hooks.server.ts`).
 *
 * The grant matters: a user is a super admin when they hold every permission in the table, so a
 * new permission would otherwise demote every owner until somebody granted it by hand.
 *
 * Idempotent and additive: it never removes or renames anything.
 */
export async function seedPermissions(
	/** The database, passed in so the seed script can run this outside SvelteKit. */
	db: Writer
): Promise<{ permissionsCreated: number }> {
	const names = permissionNames();

	const existing = await db
		.select({ name: permissions.name })
		.from(permissions)
		.where(inArray(permissions.name, names));
	const missing = names.filter((name) => !existing.some((row) => row.name === name));

	if (missing.length) {
		await db
			.insert(permissions)
			.values(missing.map((name) => ({ name, description: DESCRIPTIONS[name] ?? name })));
	}

	const [all, owners] = await Promise.all([
		db.select({ id: permissions.id }).from(permissions),
		db.select({ id: roles.id }).from(roles).where(eq(roles.isOwner, true))
	]);

	if (all.length && owners.length) {
		await db
			.insert(rolePermissions)
			.ignore()
			.values(owners.flatMap((r) => all.map((p) => ({ roleId: r.id, permissionId: p.id }))));
	}

	return { permissionsCreated: missing.length };
}

/**
 * A new business, ready to use: its roles with their permissions, the default units and payment
 * methods, a main
 * branch and a main store. Returns what the first user needs to be created with.
 *
 * Runs in the caller's transaction, so a failed registration leaves no half-made organization.
 * Assumes `seedPermissions` has run (the hook does it on the first request).
 */
export async function createOrganization(
	tx: Tx,
	input: { name: string; tin?: string | null; phone?: string | null }
): Promise<{ orgId: number; ownerRoleId: number; branchId: number }> {
	const [org] = await tx
		.insert(organization)
		.values({ name: input.name, tin: input.tin || null, phone: input.phone || null })
		.$returningId();
	const orgId = org.id;

	const allPermissions = await tx
		.select({ id: permissions.id, name: permissions.name })
		.from(permissions);

	let ownerRoleId = 0;
	for (const role of DEFAULT_ROLES) {
		const [created] = await tx
			.insert(roles)
			.values({
				orgId,
				name: role.name,
				description: role.description,
				isOwner: role.permissions === 'all'
			})
			.$returningId();

		if (role.permissions === 'all') ownerRoleId = created.id;

		const granted =
			role.permissions === 'all'
				? allPermissions
				: allPermissions.filter((p) => (role.permissions as string[]).includes(p.name));
		if (granted.length) {
			await tx
				.insert(rolePermissions)
				.values(granted.map((p) => ({ roleId: created.id, permissionId: p.id })));
		}
	}

	await tx.insert(uom).values(DEFAULT_UNITS.map((u) => ({ ...u, orgId })));
	await tx.insert(paymentMethod).values(DEFAULT_PAYMENT_METHODS.map((m) => ({ ...m, orgId })));

	const [main] = await tx
		.insert(branch)
		.values({ orgId, name: 'Main Branch', code: 'MAIN' })
		.$returningId();
	await tx.insert(location).values([
		{ orgId, branchId: main.id, name: 'Main Store', kind: 'storage' },
		{ orgId, branchId: main.id, name: 'Quarantine', kind: 'quarantine' }
	]);

	return { orgId, ownerRoleId, branchId: main.id };
}
