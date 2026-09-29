import LayoutDashboard from '@lucide/svelte/icons/layout-dashboard';
import Package from '@lucide/svelte/icons/package';
import Warehouse from '@lucide/svelte/icons/warehouse';
import CalendarClock from '@lucide/svelte/icons/calendar-clock';
import FileText from '@lucide/svelte/icons/file-text';
import Settings from '@lucide/svelte/icons/settings';
import Users from '@lucide/svelte/icons/users';
import Building2 from '@lucide/svelte/icons/building-2';
import Banknote from '@lucide/svelte/icons/banknote';
import Wallet from '@lucide/svelte/icons/wallet';
import Receipt from '@lucide/svelte/icons/receipt';
import Store from '@lucide/svelte/icons/store';
import Truck from '@lucide/svelte/icons/truck';
import ClipboardCheck from '@lucide/svelte/icons/clipboard-check';
import ShoppingCart from '@lucide/svelte/icons/shopping-cart';
import ChartColumn from '@lucide/svelte/icons/chart-column';
import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
import RefreshCw from '@lucide/svelte/icons/refresh-cw';
import Contact from '@lucide/svelte/icons/contact';
import Clock from '@lucide/svelte/icons/clock';
import ShoppingBag from '@lucide/svelte/icons/shopping-bag';
import Calculator from '@lucide/svelte/icons/calculator';
import Tags from '@lucide/svelte/icons/tags';
import Barcode from '@lucide/svelte/icons/barcode';
import Upload from '@lucide/svelte/icons/upload';
import Route from '@lucide/svelte/icons/route';
import ClipboardList from '@lucide/svelte/icons/clipboard-list';
import ShieldCheck from '@lucide/svelte/icons/shield-check';
import Snail from '@lucide/svelte/icons/snail';
import ChartPie from '@lucide/svelte/icons/chart-pie';
import PackageX from '@lucide/svelte/icons/package-x';
import ChartLine from '@lucide/svelte/icons/chart-line';
import ScanSearch from '@lucide/svelte/icons/scan-search';
import type { Component } from 'svelte';
import type { IconProps } from '@lucide/svelte';
import type { NavItem } from '@nahu/admin-kit/navigation';

/** The sidebar and the search palette. Each entry is shown only if `access` lets the viewer in. */
export const NAVIGATION: NavItem[] = [
	{ title: 'Dashboard', url: '/dashboard', icon: LayoutDashboard },
	{
		title: 'Items',
		url: '/dashboard/items',
		icon: Package,
		items: [
			{ title: 'Items', url: '/dashboard/items', icon: Package },
			{ title: 'Labels & barcodes', url: '/dashboard/items/labels', icon: Barcode }
		]
	},
	{
		title: 'Sales',
		url: '/dashboard/sales',
		icon: ShoppingBag,
		items: [
			{ title: 'Till (POS)', url: '/dashboard/pos', icon: Calculator },
			{ title: 'Sales & invoices', url: '/dashboard/sales', icon: ShoppingBag },
			{ title: 'Proformas', url: '/dashboard/sales/quotes', icon: FileText },
			{ title: 'Till shifts', url: '/dashboard/pos/shifts', icon: Clock }
		]
	},
	{
		title: 'Stock',
		url: '/dashboard/stock',
		icon: Warehouse,
		items: [
			{ title: 'On hand', url: '/dashboard/stock', icon: Warehouse },
			{ title: 'Documents', url: '/dashboard/stock/documents', icon: FileText },
			{ title: 'Transfers in transit', url: '/dashboard/stock/transfers', icon: Route },
			{ title: 'Requisitions', url: '/dashboard/requisitions', icon: ClipboardList },
			{ title: 'Counts', url: '/dashboard/stock/counts', icon: ClipboardCheck },
			{ title: 'Expiry follow-up', url: '/dashboard/stock/expiry', icon: TriangleAlert },
			{ title: 'Lots & expiry', url: '/dashboard/lots', icon: CalendarClock }
		]
	},
	{
		title: 'Purchasing',
		url: '/dashboard/purchasing',
		icon: ShoppingCart,
		items: [
			{ title: 'Purchase orders', url: '/dashboard/purchasing', icon: ShoppingCart },
			{ title: 'Reorder', url: '/dashboard/purchasing/reorder', icon: RefreshCw }
		]
	},
	{ title: 'Suppliers', url: '/dashboard/suppliers', icon: Truck },
	{
		title: 'Customers',
		url: '/dashboard/customers',
		icon: Contact,
		items: [
			{ title: 'Customers', url: '/dashboard/customers', icon: Contact },
			{ title: 'Credit & ageing', url: '/dashboard/customers/credit', icon: Clock }
		]
	},
	{ title: 'Approvals', url: '/dashboard/approvals', icon: ShieldCheck },
	{ title: 'Transactions', url: '/dashboard/transactions', icon: Banknote },
	{
		title: 'Reports',
		url: '/dashboard/reports',
		icon: ChartColumn,
		items: [
			{ title: 'Overview', url: '/dashboard/reports', icon: ChartColumn },
			{ title: 'Slow & dead stock', url: '/dashboard/reports/slow-moving', icon: Snail },
			{ title: 'ABC analysis', url: '/dashboard/reports/abc', icon: ChartPie },
			{ title: 'Stock-outs', url: '/dashboard/reports/stock-outs', icon: PackageX },
			{ title: 'Stock trend', url: '/dashboard/reports/trend', icon: ChartLine },
			{ title: 'Serial lookup', url: '/dashboard/reports/serials', icon: ScanSearch }
		]
	},
	{ title: 'Admin panel', url: '/dashboard/admin-panel', icon: Settings }
];

/** The admin panel's index cards. */
export const SETTINGS_SECTIONS: {
	title: string;
	description: string;
	icon: Component<IconProps>;
	items: NavItem[];
}[] = [
	{
		title: 'Business',
		description: 'Your business name, TIN, contact details and logo.',
		icon: Store,
		items: [{ title: 'Business profile', url: '/dashboard/admin-panel/business', icon: Store }]
	},
	{
		title: 'Where stock is kept',
		description: 'Branches, and the stores, shelves and fridges inside them.',
		icon: Building2,
		items: [
			{ title: 'Branches', url: '/dashboard/admin-panel/branches', icon: Building2 },
			{ title: 'Locations', url: '/dashboard/admin-panel/locations', icon: Warehouse }
		]
	},
	{
		title: 'Catalogue',
		description: 'The lists items are described with.',
		icon: Package,
		items: [
			{ title: 'Categories', url: '/dashboard/admin-panel/categories', icon: Package },
			{ title: 'Units of measure', url: '/dashboard/admin-panel/units', icon: Package }
		]
	},
	{
		title: 'Money',
		description: 'How money moves: cash, Telebirr, bank accounts, and the fiscal devices.',
		icon: Wallet,
		items: [
			{ title: 'Payment methods', url: '/dashboard/admin-panel/payment-methods', icon: Wallet },
			{ title: 'Price lists', url: '/dashboard/admin-panel/price-lists', icon: Tags },
			{ title: 'Fiscal devices', url: '/dashboard/admin-panel/fiscal-devices', icon: Receipt }
		]
	},
	{
		title: 'Getting started',
		description: 'Bring in items, suppliers, customers and opening stock from a spreadsheet.',
		icon: Upload,
		items: [{ title: 'Import', url: '/dashboard/admin-panel/import', icon: Upload }]
	},
	{
		title: 'People',
		description: 'Who can sign in, and what each role may do.',
		icon: Users,
		items: [
			{ title: 'Users', url: '/dashboard/admin-panel/users', icon: Users },
			{ title: 'Roles', url: '/dashboard/admin-panel/roles', icon: Users }
		]
	}
];

/** Where each kind of record's page lives, so table cells can link to it. */
export const ENTITIES: Record<string, string> = {
	user: '/dashboard/admin-panel/users',
	role: '/dashboard/admin-panel/roles',
	item: '/dashboard/items',
	document: '/dashboard/stock/documents',
	transaction: '/dashboard/transactions',
	supplier: '/dashboard/suppliers',
	customer: '/dashboard/customers',
	quote: '/dashboard/sales/quotes',
	sale: '/dashboard/sales',
	shift: '/dashboard/pos/shifts',
	purchaseOrder: '/dashboard/purchasing',
	count: '/dashboard/stock/counts',
	requisition: '/dashboard/requisitions'
};
