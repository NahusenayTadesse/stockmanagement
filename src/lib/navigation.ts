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
import MessageSquare from '@lucide/svelte/icons/message-square';
import CreditCard from '@lucide/svelte/icons/credit-card';
import LifeBuoy from '@lucide/svelte/icons/life-buoy';
import type { Component } from 'svelte';
import { m } from '$lib/paraglide/messages.js';
import type { IconProps } from '@lucide/svelte';
import type { NavItem } from '@nahu/admin-kit/navigation';

/**
 * The sidebar and the search palette. Each entry is shown only if `access` lets the viewer in.
 * Titles are getters, so they are read in the viewer's language when the menu is drawn.
 */
export const NAVIGATION: NavItem[] = [
	{
		get title() {
			return m.nav_dashboard();
		},
		url: '/dashboard',
		icon: LayoutDashboard
	},
	{
		get title() {
			return m.nav_items();
		},
		url: '/dashboard/items',
		icon: Package,
		items: [
			{
				get title() {
					return m.nav_items();
				},
				url: '/dashboard/items',
				icon: Package
			},
			{
				get title() {
					return m.nav_labels();
				},
				url: '/dashboard/items/labels',
				icon: Barcode
			}
		]
	},
	{
		get title() {
			return m.nav_sales();
		},
		url: '/dashboard/sales',
		icon: ShoppingBag,
		items: [
			{
				get title() {
					return m.nav_pos();
				},
				url: '/dashboard/pos',
				icon: Calculator
			},
			{
				get title() {
					return m.nav_sales_invoices();
				},
				url: '/dashboard/sales',
				icon: ShoppingBag
			},
			{
				get title() {
					return m.nav_proformas();
				},
				url: '/dashboard/sales/quotes',
				icon: FileText
			},
			{
				get title() {
					return m.nav_shifts();
				},
				url: '/dashboard/pos/shifts',
				icon: Clock
			}
		]
	},
	{
		get title() {
			return m.nav_stock();
		},
		url: '/dashboard/stock',
		icon: Warehouse,
		items: [
			{
				get title() {
					return m.nav_on_hand();
				},
				url: '/dashboard/stock',
				icon: Warehouse
			},
			{
				get title() {
					return m.nav_documents();
				},
				url: '/dashboard/stock/documents',
				icon: FileText
			},
			{
				get title() {
					return m.nav_transfers();
				},
				url: '/dashboard/stock/transfers',
				icon: Route
			},
			{
				get title() {
					return m.nav_requisitions();
				},
				url: '/dashboard/requisitions',
				icon: ClipboardList
			},
			{
				get title() {
					return m.nav_counts();
				},
				url: '/dashboard/stock/counts',
				icon: ClipboardCheck
			},
			{
				get title() {
					return m.nav_expiry();
				},
				url: '/dashboard/stock/expiry',
				icon: TriangleAlert
			},
			{
				get title() {
					return m.nav_lots();
				},
				url: '/dashboard/lots',
				icon: CalendarClock
			}
		]
	},
	{
		get title() {
			return m.nav_purchasing();
		},
		url: '/dashboard/purchasing',
		icon: ShoppingCart,
		items: [
			{
				get title() {
					return m.nav_purchase_orders();
				},
				url: '/dashboard/purchasing',
				icon: ShoppingCart
			},
			{
				get title() {
					return m.nav_reorder();
				},
				url: '/dashboard/purchasing/reorder',
				icon: RefreshCw
			}
		]
	},
	{
		get title() {
			return m.nav_suppliers();
		},
		url: '/dashboard/suppliers',
		icon: Truck
	},
	{
		get title() {
			return m.nav_customers();
		},
		url: '/dashboard/customers',
		icon: Contact,
		items: [
			{
				get title() {
					return m.nav_customers();
				},
				url: '/dashboard/customers',
				icon: Contact
			},
			{
				get title() {
					return m.nav_credit();
				},
				url: '/dashboard/customers/credit',
				icon: Clock
			}
		]
	},
	{
		get title() {
			return m.nav_approvals();
		},
		url: '/dashboard/approvals',
		icon: ShieldCheck
	},
	{
		get title() {
			return m.nav_transactions();
		},
		url: '/dashboard/transactions',
		icon: Banknote
	},
	{
		get title() {
			return m.nav_reports();
		},
		url: '/dashboard/reports',
		icon: ChartColumn,
		items: [
			{
				get title() {
					return m.nav_reports_overview();
				},
				url: '/dashboard/reports',
				icon: ChartColumn
			},
			{
				get title() {
					return m.nav_slow_moving();
				},
				url: '/dashboard/reports/slow-moving',
				icon: Snail
			},
			{
				get title() {
					return m.nav_abc();
				},
				url: '/dashboard/reports/abc',
				icon: ChartPie
			},
			{
				get title() {
					return m.nav_stock_outs();
				},
				url: '/dashboard/reports/stock-outs',
				icon: PackageX
			},
			{
				get title() {
					return m.nav_trend();
				},
				url: '/dashboard/reports/trend',
				icon: ChartLine
			},
			{
				get title() {
					return m.nav_serials();
				},
				url: '/dashboard/reports/serials',
				icon: ScanSearch
			}
		]
	},
	{
		get title() {
			return m.nav_admin();
		},
		url: '/dashboard/admin-panel',
		icon: Settings
	},
	{
		get title() {
			return m.nav_help();
		},
		url: '/dashboard/help',
		icon: LifeBuoy
	}
];

/** The admin panel's index cards. */
export const SETTINGS_SECTIONS: {
	title: string;
	description: string;
	icon: Component<IconProps>;
	items: NavItem[];
}[] = [
	{
		get title() {
			return m.nav_section_business();
		},
		get description() {
			return m.nav_section_business_desc();
		},
		icon: Store,
		items: [
			{
				get title() {
					return m.nav_business_profile();
				},
				url: '/dashboard/admin-panel/business',
				icon: Store
			},
			{
				get title() {
					return m.nav_sms();
				},
				url: '/dashboard/admin-panel/sms',
				icon: MessageSquare
			},
			{
				get title() {
					return m.billing_title();
				},
				url: '/dashboard/subscription',
				icon: CreditCard
			}
		]
	},
	{
		get title() {
			return m.nav_section_places();
		},
		get description() {
			return m.nav_section_places_desc();
		},
		icon: Building2,
		items: [
			{
				get title() {
					return m.nav_branches();
				},
				url: '/dashboard/admin-panel/branches',
				icon: Building2
			},
			{
				get title() {
					return m.nav_locations();
				},
				url: '/dashboard/admin-panel/locations',
				icon: Warehouse
			}
		]
	},
	{
		get title() {
			return m.nav_section_catalogue();
		},
		get description() {
			return m.nav_section_catalogue_desc();
		},
		icon: Package,
		items: [
			{
				get title() {
					return m.nav_categories();
				},
				url: '/dashboard/admin-panel/categories',
				icon: Package
			},
			{
				get title() {
					return m.nav_units();
				},
				url: '/dashboard/admin-panel/units',
				icon: Package
			}
		]
	},
	{
		get title() {
			return m.nav_section_money();
		},
		get description() {
			return m.nav_section_money_desc();
		},
		icon: Wallet,
		items: [
			{
				get title() {
					return m.nav_payment_methods();
				},
				url: '/dashboard/admin-panel/payment-methods',
				icon: Wallet
			},
			{
				get title() {
					return m.nav_price_lists();
				},
				url: '/dashboard/admin-panel/price-lists',
				icon: Tags
			},
			{
				get title() {
					return m.nav_fiscal_devices();
				},
				url: '/dashboard/admin-panel/fiscal-devices',
				icon: Receipt
			}
		]
	},
	{
		get title() {
			return m.nav_section_start();
		},
		get description() {
			return m.nav_section_start_desc();
		},
		icon: Upload,
		items: [
			{
				get title() {
					return m.nav_import();
				},
				url: '/dashboard/admin-panel/import',
				icon: Upload
			}
		]
	},
	{
		get title() {
			return m.nav_section_people();
		},
		get description() {
			return m.nav_section_people_desc();
		},
		icon: Users,
		items: [
			{
				get title() {
					return m.nav_users();
				},
				url: '/dashboard/admin-panel/users',
				icon: Users
			},
			{
				get title() {
					return m.nav_roles();
				},
				url: '/dashboard/admin-panel/roles',
				icon: Users
			}
		]
	}
];

/** The site admin's menu (`/admin`): Digital Construct's view over every business. */
export const ADMIN_NAVIGATION: NavItem[] = [
	{
		get title() {
			return m.platform_nav_overview();
		},
		url: '/admin',
		icon: LayoutDashboard
	},
	{
		get title() {
			return m.platform_nav_businesses();
		},
		url: '/admin/businesses',
		icon: Building2
	},
	{
		get title() {
			return m.platform_nav_payments();
		},
		url: '/admin/payments',
		icon: Banknote
	},
	{
		get title() {
			return m.platform_nav_packages();
		},
		url: '/admin/packages',
		icon: Package
	},
	{
		get title() {
			return m.platform_nav_bank_accounts();
		},
		url: '/admin/bank-accounts',
		icon: Wallet
	},
	{
		get title() {
			return m.platform_nav_messages();
		},
		url: '/admin/messages',
		icon: MessageSquare
	}
];

/** Where the site admin's records live. */
export const ADMIN_ENTITIES: Record<string, string> = {
	business: '/admin/businesses'
};

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
