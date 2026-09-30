/**
 * The help: every article in the help centre, the tips the floating help button shows for the
 * page you are on, and the getting-started guide read from this one list, so an instruction is
 * never right in one place and stale in another.
 *
 * Written for whoever runs the shop, not for a developer: each article answers "what do I click,
 * and what happens when I do". `**bold**` marks what you click or read on screen.
 *
 * The two languages sit side by side in each article, rather than in `messages/`, because these
 * are paragraphs of prose: an article is translated and reviewed as a whole, and keeping both
 * versions in one place is what stops one from drifting. The words around the articles (the
 * search box, the filters, the buttons) are ordinary messages in `messages/{en,am}/help.json`.
 * Menu names in the Amharic text are the menu's own Amharic labels.
 */
import type { Component } from 'svelte';
import type { IconProps } from '@lucide/svelte';
import Rocket from '@lucide/svelte/icons/rocket';
import Package from '@lucide/svelte/icons/package';
import Warehouse from '@lucide/svelte/icons/warehouse';
import ShoppingBag from '@lucide/svelte/icons/shopping-bag';
import ShoppingCart from '@lucide/svelte/icons/shopping-cart';
import Banknote from '@lucide/svelte/icons/banknote';
import Users from '@lucide/svelte/icons/users';
import CreditCard from '@lucide/svelte/icons/credit-card';
import { getLocale } from '$lib/paraglide/runtime';

/** One piece of text in both languages. */
export type Text = { en: string; am: string };

const t = (en: string, am: string): Text => ({ en, am });

/** The piece of text in the viewer's language. Call it when rendering, never at module load. */
export function say(text: Text): string {
	return getLocale() === 'am' ? text.am : text.en;
}

/** Who an article is for: the roles a new business starts with. */
export const HELP_ROLES = [
	'owner',
	'manager',
	'cashier',
	'storekeeper',
	'clerk',
	'department'
] as const;
export type HelpRole = (typeof HELP_ROLES)[number];

const EVERYONE: HelpRole[] = [...HELP_ROLES];
const RUNS_THE_BUSINESS: HelpRole[] = ['owner', 'manager'];
const WORKS_THE_STORE: HelpRole[] = ['owner', 'manager', 'storekeeper', 'clerk'];
const SELLS: HelpRole[] = ['owner', 'manager', 'cashier', 'clerk'];
const HANDLES_MONEY: HelpRole[] = ['owner', 'manager', 'cashier', 'clerk'];

export type HelpTopic = {
	id: string;
	section: string;
	title: Text;
	/** The one-line answer. Shown under the title, in search results and in the help button. */
	summary: Text;
	/**
	 * The screen the article is about. The article offers to open it, the help button shows the
	 * article on it, and the help centre can hide what the viewer's role cannot open.
	 */
	path?: string;
	/** A tour of that screen (`$lib/help/tours`), started with "Show me". */
	tour?: string;
	steps?: Text[];
	/** What is easy to get wrong, or worth knowing before you start. */
	notes?: Text[];
	/** More words someone might search for, in either language. */
	keywords?: string[];
	roles: HelpRole[];
};

export type HelpSection = {
	id: string;
	title: Text;
	blurb: Text;
	icon: Component<IconProps>;
};

export const HELP_SECTIONS: HelpSection[] = [
	{
		id: 'start',
		title: t('Getting started', 'መጀመሪያ'),
		blurb: t(
			'Finding your way around, and setting up a new business.',
			'በሥርዓቱ ውስጥ መንገድዎን ማግኘት፣ እና አዲስ ድርጅት ማዘጋጀት።'
		),
		icon: Rocket
	},
	{
		id: 'items',
		title: t('Items', 'ዕቃዎች'),
		blurb: t(
			'What you stock and sell: units, packs, lots, barcodes.',
			'የሚያከማቹትና የሚሸጡት፦ መለኪያዎች፣ ጥቅሎች፣ ሎቶች፣ ባርኮዶች።'
		),
		icon: Package
	},
	{
		id: 'stock',
		title: t('Stock', 'ክምችት'),
		blurb: t(
			'Receiving, moving, counting and writing off stock.',
			'ክምችትን መረከብ፣ ማንቀሳቀስ፣ መቁጠር እና ከሂሳብ መሰረዝ።'
		),
		icon: Warehouse
	},
	{
		id: 'selling',
		title: t('Selling', 'ሽያጭ'),
		blurb: t('The till, proformas, credit and returns.', 'ካሽ መመዝገቢያ፣ ፕሮፎርማ፣ ዱቤ እና ተመላሽ።'),
		icon: ShoppingBag
	},
	{
		id: 'buying',
		title: t('Buying', 'ግዢ'),
		blurb: t(
			'Suppliers, purchase orders and what to reorder.',
			'አቅራቢዎች፣ የግዢ ትዕዛዞች እና እንደገና መታዘዝ ያለበት።'
		),
		icon: ShoppingCart
	},
	{
		id: 'money',
		title: t('Money and tax', 'ገንዘብ እና ግብር'),
		blurb: t(
			'Payments, checking them, VAT, TOT and text messages.',
			'ክፍያዎች፣ ማረጋገጥ፣ ተ.እ.ታ፣ TOT እና አጭር የጽሑፍ መልዕክቶች።'
		),
		icon: Banknote
	},
	{
		id: 'people',
		title: t('People and control', 'ሰዎች እና ቁጥጥር'),
		blurb: t('Users, roles, branches and approvals.', 'ተጠቃሚዎች፣ ሚናዎች፣ ቅርንጫፎች እና ማጽደቅ።'),
		icon: Users
	},
	{
		id: 'account',
		title: t('Your account and subscription', 'መለያዎ እና ፓኬጅዎ'),
		blurb: t('Your password, your package, and paying for it.', 'የይለፍ ቃልዎ፣ ፓኬጅዎ፣ እና ክፍያው።'),
		icon: CreditCard
	}
];

export const HELP_TOPICS: HelpTopic[] = [
	// ── Getting started ────────────────────────────────────────────────────────────────────
	{
		id: 'first-day',
		section: 'start',
		title: t('Setting up a new business', 'አዲስ ድርጅት ማዘጋጀት'),
		summary: t(
			'Seven steps take a new business from empty to selling. The Getting started guide on the Dashboard keeps track of them for you.',
			'ሰባት እርምጃዎች አዲስ ድርጅትን ከባዶ እስከ ሽያጭ ያደርሳሉ። በዳሽቦርድ ላይ ያለው የመጀመሪያ መመሪያ ይከታተልልዎታል።'
		),
		path: '/dashboard',
		tour: 'welcome',
		steps: [
			t(
				'Fill in your **Business profile**: address, TIN and logo. They print on every document.',
				'**የድርጅት መረጃ**ን ይሙሉ፦ አድራሻ፣ TIN እና አርማ። በእያንዳንዱ ሰነድ ላይ ይታተማሉ።'
			),
			t(
				'Add your **Items**, one by one or from an Excel sheet under **Import**.',
				'**ዕቃዎች**ዎን አንድ በአንድ ይጨምሩ፣ ወይም በ**አስገባ (Import)** ከ Excel ያስገቡ።'
			),
			t(
				'Add the **Suppliers** you buy from. Every item that keeps stock needs one.',
				'የሚገዙባቸውን **አቅራቢዎች** ይጨምሩ። ክምችት የሚይዝ እያንዳንዱ ዕቃ አቅራቢ ያስፈልገዋል።'
			),
			t(
				'Receive your opening stock: a receipt under **Stock → Documents**, or the opening stock sheet in **Import**.',
				'የመክፈቻ ክምችትዎን ይረከቡ፦ በ**ክምችት → ሰነዶች** የዕቃ ገቢ፣ ወይም በ**አስገባ (Import)** የመክፈቻ ክምችት ሉህ።'
			),
			t(
				'Make a first sale at **Sales → Till (POS)**.',
				'የመጀመሪያ ሽያጭዎን በ**ሽያጭ → ካሽ መመዝገቢያ (POS)** ያድርጉ።'
			),
			t(
				'Invite your staff under **Admin panel → Users**, each on the role that fits their job.',
				'ሠራተኞችዎን በ**የአስተዳደር ገጽ → ተጠቃሚዎች** ይጋብዙ፤ እያንዳንዱን ከሥራው ጋር በሚስማማ ሚና።'
			),
			t(
				'Choose how you will pay for your package, under **Subscription**, before the free trial ends.',
				'ነፃ ሙከራው ከማብቃቱ በፊት ለፓኬጅዎ እንዴት እንደሚከፍሉ በ**ፓኬጅ እና ክፍያ** ይምረጡ።'
			)
		],
		notes: [
			t(
				'A main branch, a main store, the usual units and ready-made roles are already set up. You can rename all of them.',
				'ዋና ቅርንጫፍ፣ ዋና መጋዘን፣ የተለመዱ መለኪያዎች እና የተዘጋጁ ሚናዎች አስቀድመው ተዘጋጅተዋል። ሁሉንም እንደገና መሰየም ይችላሉ።'
			)
		],
		keywords: ['onboarding', 'new', 'setup', 'checklist', 'guide', 'start', 'ማዘጋጀት', 'መመሪያ'],
		roles: RUNS_THE_BUSINESS
	},
	{
		id: 'finding-your-way',
		section: 'start',
		title: t('Finding your way around', 'በሥርዓቱ ውስጥ መንቀሳቀስ'),
		summary: t(
			'The menu on the left lists only what your role may open. The bar at the top searches, switches language and theme, and holds your account.',
			'በግራ ያለው ማውጫ ሚናዎ የሚከፍተውን ብቻ ያሳያል። ከላይ ያለው አሞሌ ይፈልጋል፣ ቋንቋና ገጽታ ይቀይራል፣ መለያዎንም ይይዛል።'
		),
		path: '/dashboard',
		tour: 'welcome',
		steps: [
			t(
				'Use the **menu** on the left. Entries with an arrow open to show the screens inside them. On a phone, the menu is behind the button at the top left.',
				'በግራ ያለውን **ማውጫ** ይጠቀሙ። ቀስት ያላቸው ግቤቶች ሲከፈቱ በውስጣቸው ያሉትን ገጾች ያሳያሉ። በስልክ ላይ ማውጫው ከላይ በግራ ካለው ቁልፍ ጀርባ ነው።'
			),
			t(
				'Click the **magnifier** at the top to jump to any screen by typing its name.',
				'በስሙ በመጻፍ ወደ ማንኛውም ገጽ ለመሄድ ከላይ ያለውን **ማጉያ** ይጫኑ።'
			),
			t(
				'Switch between **English and አማርኛ** with the language button. Your choice is remembered.',
				'በቋንቋ ቁልፉ **English እና አማርኛ** መካከል ይቀያይሩ። ምርጫዎ ይታወሳል።'
			),
			t(
				'Open **your account** (the person icon) to change your password, see your subscription or sign out.',
				'የይለፍ ቃልዎን ለመቀየር፣ ፓኬጅዎን ለማየት ወይም ለመውጣት **መለያዎን** (የሰው ምልክቱን) ይክፈቱ።'
			),
			t(
				'The round **Help** button at the bottom right explains the screen you are on, and can walk you around it.',
				'ከታች በቀኝ ያለው ክብ የ**እገዛ** ቁልፍ ያሉበትን ገጽ ያብራራል፣ ገጹንም ሊያስጎበኝዎት ይችላል።'
			)
		],
		keywords: ['menu', 'sidebar', 'search', 'language', 'amharic', 'dark', 'ማውጫ', 'ቋንቋ'],
		roles: EVERYONE
	},
	{
		id: 'tables',
		section: 'start',
		title: t('Searching, sorting and exporting tables', 'ሠንጠረዦችን መፈለግ፣ መደርደር እና ማውጣት'),
		summary: t(
			'Every list works the same way: search box, sortable headings, and export to Excel (CSV) or PDF.',
			'እያንዳንዱ ዝርዝር በአንድ ዓይነት ይሠራል፦ የፍለጋ ሳጥን፣ የሚደረደሩ ርዕሶች፣ እና ወደ Excel (CSV) ወይም PDF ማውጣት።'
		),
		steps: [
			t(
				'Type in the **search box** above a table; it looks at every column at once.',
				'ከሠንጠረዡ በላይ ባለው **የፍለጋ ሳጥን** ይጻፉ፤ ሁሉንም ዓምዶች በአንድ ጊዜ ይመለከታል።'
			),
			t(
				'Click a heading with arrows to **sort** by it; click again to reverse.',
				'በቀስት ያለ ርዕስ ላይ በመጫን በእሱ **ይደርድሩ**፤ እንደገና ሲጫኑ ይገለበጣል።'
			),
			t(
				'Use the **download** button to save what you see to Excel (CSV) or PDF.',
				'የሚያዩትን ወደ Excel (CSV) ወይም PDF ለማስቀመጥ የ**ማውረጃ** ቁልፉን ይጠቀሙ።'
			)
		],
		notes: [
			t(
				'Searching and sorting only change what you see, never your data.',
				'መፈለግና መደርደር የሚቀይሩት የሚያዩትን ብቻ ነው፤ መረጃዎን በፍጹም አይቀይሩም።'
			)
		],
		keywords: ['filter', 'sort', 'csv', 'excel', 'pdf', 'export', 'download', 'ፍለጋ'],
		roles: EVERYONE
	},
	{
		id: 'dates',
		section: 'start',
		title: t('Dates and the Ethiopian calendar', 'ቀኖች እና የኢትዮጵያ ዘመን አቆጣጠር'),
		summary: t(
			'Dates are shown on the Ethiopian calendar. Any date field can switch to Gregorian when a supplier needs it.',
			'ቀኖች በኢትዮጵያ አቆጣጠር ይታያሉ። አቅራቢ ሲፈልግ ማንኛውም የቀን ሳጥን ወደ ጎርጎርዮሳዊ መቀየር ይችላል።'
		),
		steps: [
			t(
				'In a date field, use the **calendar switch** to choose Ethiopian or Gregorian. The other date is shown underneath as you type.',
				'በቀን ሳጥን ውስጥ ኢትዮጵያዊ ወይም ጎርጎርዮሳዊን ለመምረጥ የ**አቆጣጠር መቀየሪያውን** ይጠቀሙ። ሲጽፉ ሌላኛው ቀን ከሥር ይታያል።'
			)
		],
		notes: [
			t(
				'Documents are numbered by the Ethiopian fiscal year, which starts on Hamle 1.',
				'ሰነዶች በኢትዮጵያ በጀት ዓመት ይቆጠራሉ፤ በጀት ዓመቱ ሐምሌ 1 ይጀምራል።'
			)
		],
		keywords: ['calendar', 'gregorian', 'date', 'fiscal year', 'አቆጣጠር', 'ቀን'],
		roles: EVERYONE
	},

	// ── Items ──────────────────────────────────────────────────────────────────────────────
	{
		id: 'add-item',
		section: 'items',
		title: t('Adding an item', 'ዕቃ መጨመር'),
		summary: t(
			'Everything the business stocks or sells is an item: its code, name, unit, price and main supplier.',
			'ድርጅቱ የሚያከማቸው ወይም የሚሸጠው ሁሉ ዕቃ ነው፦ ኮዱ፣ ስሙ፣ መለኪያው፣ ዋጋው እና ዋና አቅራቢው።'
		),
		path: '/dashboard/items',
		tour: 'items',
		steps: [
			t('Open **Items**.', '**ዕቃዎች**ን ይክፈቱ።'),
			t(
				'Click the **add** button above the list and fill in the SKU (your code), the name and the base unit: the smallest unit you count in.',
				'ከዝርዝሩ በላይ ያለውን የ**መጨመሪያ** ቁልፍ ይጫኑ፤ SKU (የእርስዎ ኮድ)፣ ስሙን እና መሠረታዊ መለኪያውን (የሚቆጥሩበትን ትንሹን መለኪያ) ይሙሉ።'
			),
			t(
				'Choose the **main supplier**. If they are not listed yet, add them with **+ New supplier** without leaving the form.',
				'**ዋና አቅራቢውን** ይምረጡ። ገና ካልተዘረዘሩ ቅጹን ሳይለቁ በ**+ አዲስ አቅራቢ** ይጨምሩ።'
			),
			t(
				'Tick what applies: tracks lots, has an expiry date, has serial numbers.',
				'የሚመለከተውን ምልክት ያድርጉ፦ ሎት ይከታተላል፣ የሚያበቃበት ቀን አለው፣ ሲሪያል ቁጥር አለው።'
			),
			t('Save. The item now appears in every picker.', 'ያስቀምጡ። ዕቃው አሁን በእያንዳንዱ መምረጫ ላይ ይታያል።')
		],
		notes: [
			t(
				"Click an item's name to open its page: packs, barcodes, the bin card, reorder levels and variants.",
				'የዕቃውን ገጽ ለመክፈት ስሙን ይጫኑ፦ ጥቅሎች፣ ባርኮዶች፣ የቢን ካርድ፣ የማዘዣ ደረጃዎች እና ዓይነቶች።'
			)
		],
		keywords: ['product', 'sku', 'new item', 'catalogue', 'ዕቃ', 'ምርት'],
		roles: WORKS_THE_STORE
	},
	{
		id: 'units-packs',
		section: 'items',
		title: t('Units and packs', 'መለኪያዎች እና ጥቅሎች'),
		summary: t(
			'Stock is kept in the base unit; packs convert. Buy by the carton, sell by the piece.',
			'ክምችት በመሠረታዊ መለኪያ ይያዛል፤ ጥቅሎች ይቀየራሉ። በካርቶን ይግዙ፣ በፍሬ ይሽጡ።'
		),
		path: '/dashboard/items',
		steps: [
			t(
				'Open an item and add a **pack**: for example, 1 carton = 24 pieces.',
				'ዕቃ ይክፈቱና **ጥቅል** ይጨምሩ፦ ለምሳሌ 1 ካርቶን = 24 ፍሬ።'
			),
			t(
				'On a receipt or a sale, choose the pack; the quantity is converted to the base unit for you.',
				'በዕቃ ገቢ ወይም በሽያጭ ላይ ጥቅሉን ይምረጡ፤ ብዛቱ ለእርስዎ ወደ መሠረታዊ መለኪያ ይቀየራል።'
			)
		],
		notes: [
			t(
				'Missing a unit? Add it under **Admin panel → Units of measure**.',
				'መለኪያ ጎድሏል? በ**የአስተዳደር ገጽ → መለኪያዎች** ይጨምሩት።'
			)
		],
		keywords: ['uom', 'carton', 'box', 'dozen', 'piece', 'conversion', 'ካርቶን', 'ፍሬ'],
		roles: WORKS_THE_STORE
	},
	{
		id: 'import',
		section: 'items',
		title: t('Importing from Excel', 'ከ Excel ማስገባት'),
		summary: t(
			'Bring in items, suppliers, customers and opening stock from a spreadsheet, with a preview before anything is saved.',
			'ዕቃዎችን፣ አቅራቢዎችን፣ ደንበኞችን እና የመክፈቻ ክምችትን ከተመን ሉህ ያስገቡ፤ ምንም ከመቀመጡ በፊት ቅድመ እይታ አለ።'
		),
		path: '/dashboard/admin-panel/import',
		steps: [
			t(
				'Open **Admin panel → Import** and download the **template** for what you are bringing in.',
				'**የአስተዳደር ገጽ → አስገባ (Import)**ን ይክፈቱና ለሚያስገቡት **አብነቱን** ያውርዱ።'
			),
			t(
				'Fill it in Excel, keeping the column headings as they are.',
				'የዓምድ ርዕሶቹን እንዳሉ በመተው በ Excel ይሙሉት።'
			),
			t(
				'Upload it. The **preview** shows what will be added, and every row with a problem and why.',
				'ይጫኑት። **ቅድመ እይታው** የሚጨመረውን፣ እና ችግር ያለበትን እያንዳንዱን ረድፍ ከምክንያቱ ጋር ያሳያል።'
			),
			t('Fix what is marked and confirm the import.', 'ምልክት የተደረገበትን ያስተካክሉና ማስገባቱን ያረጋግጡ።')
		],
		notes: [
			t(
				'Import suppliers before items, and items before opening stock: each refers to the one before.',
				'ከዕቃዎች በፊት አቅራቢዎችን፣ ከመክፈቻ ክምችት በፊት ዕቃዎችን ያስገቡ፤ እያንዳንዱ ቀዳሚውን ይጠቅሳል።'
			)
		],
		keywords: ['excel', 'xlsx', 'csv', 'spreadsheet', 'upload', 'bulk', 'opening stock', 'ተመን ሉህ'],
		roles: RUNS_THE_BUSINESS
	},
	{
		id: 'labels',
		section: 'items',
		title: t('Barcodes and shelf labels', 'ባርኮዶች እና የመደርደሪያ መለያዎች'),
		summary: t(
			'Items without a barcode can be given one, and label sheets print for any items you choose.',
			'ባርኮድ የሌላቸው ዕቃዎች ባርኮድ ሊሰጣቸው ይችላል፤ ለመረጧቸው ዕቃዎች የመለያ ሉሆች ይታተማሉ።'
		),
		path: '/dashboard/items/labels',
		steps: [
			t(
				'On **Items**, use **Give barcodes** to number every item that has none.',
				'በ**ዕቃዎች** ገጽ፣ ባርኮድ የሌለውን እያንዳንዱን ዕቃ ለመቁጠር **ባርኮድ ስጥ**ን ይጠቀሙ።'
			),
			t(
				'Open **Items → Labels & barcodes**, choose the items and how many of each, and print.',
				'**ዕቃዎች → መለያዎች እና ባርኮዶች**ን ይክፈቱ፤ ዕቃዎቹንና የእያንዳንዱን ብዛት ይምረጡ፣ ያትሙ።'
			)
		],
		keywords: ['barcode', 'ean', 'label', 'sticker', 'print', 'scanner', 'ባርኮድ', 'መለያ'],
		roles: WORKS_THE_STORE
	},
	{
		id: 'lots-expiry',
		section: 'items',
		title: t('Lots, expiry dates and serial numbers', 'ሎቶች፣ የሚያበቃበት ቀን እና ሲሪያል ቁጥሮች'),
		summary: t(
			'Items that track lots are issued first-expiry-first-out; expired or quarantined lots are never sold.',
			'ሎት የሚከታተሉ ዕቃዎች ቀድሞ የሚያበቃው ቀድሞ ይወጣል፤ ጊዜው ያለፈ ወይም ተለይቶ የተቀመጠ ሎት በፍጹም አይሸጥም።'
		),
		path: '/dashboard/lots',
		steps: [
			t(
				'When receiving, enter the lot number and expiry date the box shows.',
				'ሲረከቡ በሳጥኑ ላይ ያለውን የሎት ቁጥር እና የሚያበቃበትን ቀን ያስገቡ።'
			),
			t(
				'**Stock → Lots & expiry** lists every lot; quarantine or recall one from there.',
				'**ክምችት → ሎቶች እና ማብቂያ** እያንዳንዱን ሎት ይዘረዝራል፤ ከዚያ ሎትን ለይተው ያስቀምጡ ወይም ያስመልሱ።'
			),
			t(
				'**Stock → Expiry follow-up** shows what is about to expire, and drafts the write-off or quarantine for you.',
				'**ክምችት → የማብቂያ ክትትል** ሊያበቃ የተቃረበውን ያሳያል፤ የመሰረዣውን ወይም የመለያውን ረቂቅ ያዘጋጅልዎታል።'
			)
		],
		notes: [
			t(
				'Serial items take one serial per unit; look any serial up under **Reports → Serial lookup**, warranty included.',
				'ሲሪያል ያላቸው ዕቃዎች በአንድ ፍሬ አንድ ሲሪያል ይይዛሉ፤ ማንኛውንም ሲሪያል ዋስትናውን ጨምሮ በ**ሪፖርቶች → ሲሪያል ፍለጋ** ይፈልጉ።'
			)
		],
		keywords: [
			'batch',
			'fefo',
			'expiry',
			'quarantine',
			'recall',
			'serial',
			'warranty',
			'ሎት',
			'ዋስትና'
		],
		roles: WORKS_THE_STORE
	},

	// ── Stock ──────────────────────────────────────────────────────────────────────────────
	{
		id: 'receive',
		section: 'stock',
		title: t('Receiving stock (GRN)', 'ክምችት መረከብ (GRN)'),
		summary: t(
			'Stock changes only when a document is posted. A delivery is a receipt: draft it, check it, post it.',
			'ክምችት የሚቀየረው ሰነድ ሲመዘገብ ብቻ ነው። የሚደርስ ዕቃ የዕቃ ገቢ ነው፦ ረቂቅ ያዘጋጁ፣ ያረጋግጡ፣ ይመዝግቡ።'
		),
		path: '/dashboard/stock/documents',
		tour: 'documents',
		steps: [
			t(
				'Open **Stock → Documents** and click **New document**.',
				'**ክምችት → ሰነዶች**ን ይክፈቱና **አዲስ ሰነድ**ን ይጫኑ።'
			),
			t(
				'Choose **Receipt**, the store it goes into and the supplier, then **Create draft**.',
				'**የዕቃ ገቢ**ን፣ የሚገባበትን መጋዘን እና አቅራቢውን ይምረጡ፤ ከዚያ **ረቂቅ ፍጠር**።'
			),
			t(
				'Add a line per item: quantity, cost, and lot and expiry where the item needs them.',
				'በእያንዳንዱ ዕቃ አንድ መስመር ይጨምሩ፦ ብዛት፣ ወጪ፣ እና ዕቃው ካስፈለገው ሎትና የሚያበቃበት ቀን።'
			),
			t(
				'Click **Post**. The stock is now on the shelf, and the supplier is owed for it.',
				'**መዝግብ**ን ይጫኑ። ክምችቱ አሁን መደርደሪያ ላይ ነው፤ አቅራቢውም ይከፈለዋል።'
			)
		],
		notes: [
			t(
				'A draft changes nothing. Anyone with the right to draft can prepare it; posting needs the right to post.',
				'ረቂቅ ምንም አይቀይርም። የማዘጋጀት መብት ያለው ማንኛውም ሰው ሊያዘጋጀው ይችላል፤ መመዝገብ የመመዝገብ መብት ይፈልጋል።'
			),
			t(
				'Buying in dollars? Enter the currency and rate on the receipt; freight, duty and clearing can be added as landed costs.',
				'በዶላር ይገዛሉ? በዕቃ ገቢው ላይ ምንዛሪውን እና ተመኑን ያስገቡ፤ ማጓጓዣ፣ ቀረጥ እና የጉምሩክ አስተላላፊ እንደ ማስገቢያ ወጪ መጨመር ይችላሉ።'
			)
		],
		keywords: [
			'grn',
			'receipt',
			'delivery',
			'goods received',
			'purchase',
			'post',
			'landed cost',
			'ገቢ',
			'ርክክብ'
		],
		roles: WORKS_THE_STORE
	},
	{
		id: 'move-stock',
		section: 'stock',
		title: t('Issuing, transferring and adjusting', 'ማውጣት፣ ማዛወር እና ማስተካከል'),
		summary: t(
			'Issues take stock out, transfers move it between stores, adjustments correct it. All are documents you post.',
			'ወጪ ክምችት ያወጣል፣ ዝውውር በመጋዘኖች መካከል ያንቀሳቅሳል፣ ማስተካከያ ያርማል። ሁሉም የሚመዘገቡ ሰነዶች ናቸው።'
		),
		path: '/dashboard/stock/documents',
		tour: 'documents',
		steps: [
			t(
				'Under **Stock → Documents → New document**, choose **Issue**, **Transfer** or **Adjustment**.',
				'በ**ክምችት → ሰነዶች → አዲስ ሰነድ**፣ **ወጪ**፣ **ዝውውር** ወይም **ማስተካከያ**ን ይምረጡ።'
			),
			t(
				'A transfer to another branch travels: it waits under **Stock → Transfers in transit** until that branch receives it.',
				'ወደ ሌላ ቅርንጫፍ የሚደረግ ዝውውር ይጓዛል፦ ያ ቅርንጫፍ እስኪረከበው ድረስ በ**ክምችት → በጉዞ ላይ ያሉ ዝውውሮች** ይጠብቃል።'
			),
			t(
				'An adjustment needs a reason: count, damage, expiry, found, opening.',
				'ማስተካከያ ምክንያት ያስፈልገዋል፦ ቆጠራ፣ ጉዳት፣ ማብቂያ፣ የተገኘ፣ መክፈቻ።'
			)
		],
		notes: [
			t(
				'Stock never goes below zero; a document that would do so is refused with the line at fault.',
				'ክምችት በፍጹም ከዜሮ በታች አይወርድም፤ ይህን የሚያደርግ ሰነድ ከስህተቱ መስመር ጋር ውድቅ ይደረጋል።'
			),
			t(
				'Whatever did not arrive on a transfer is written off as lost in transit, so the loss shows.',
				'በዝውውር ያልደረሰው በጉዞ ላይ እንደጠፋ ይሰረዛል፤ ስለዚህ ኪሳራው ይታያል።'
			)
		],
		keywords: [
			'issue',
			'transfer',
			'adjustment',
			'write-off',
			'damage',
			'in transit',
			'ወጪ',
			'ዝውውር',
			'ማስተካከያ'
		],
		roles: WORKS_THE_STORE
	},
	{
		id: 'counts',
		section: 'stock',
		title: t('Counting stock', 'ክምችት መቁጠር'),
		summary: t(
			'A count freezes what the system expects, you enter what is there, and posting turns the differences into adjustments.',
			'ቆጠራ ሥርዓቱ የሚጠብቀውን ያስቀምጣል፤ ያለውን ያስገባሉ፤ መመዝገብ ልዩነቶቹን ወደ ማስተካከያ ይቀይራል።'
		),
		path: '/dashboard/stock/counts',
		steps: [
			t(
				'Open **Stock → Counts** and start a count for a store.',
				'**ክምችት → ቆጠራዎች**ን ይክፈቱና ለአንድ መጋዘን ቆጠራ ይጀምሩ።'
			),
			t(
				'Print the **count sheet**, count, then enter the numbers.',
				'የ**ቆጠራ ሉሁን** ያትሙ፣ ይቁጠሩ፣ ከዚያ ቁጥሮቹን ያስገቡ።'
			),
			t(
				'Post the count. Every difference becomes an adjustment.',
				'ቆጠራውን ይመዝግቡ። እያንዳንዱ ልዩነት ማስተካከያ ይሆናል።'
			)
		],
		keywords: ['stocktake', 'inventory count', 'variance', 'cycle count', 'ቆጠራ', 'ልዩነት'],
		roles: WORKS_THE_STORE
	},
	{
		id: 'requisitions',
		section: 'stock',
		title: t('Requisitions from departments', 'ከክፍሎች የሚመጡ የዕቃ ጥያቄዎች'),
		summary: t(
			'A department asks the store for items; someone approves it, and the store issues what was approved.',
			'ክፍል ከመጋዘኑ ዕቃ ይጠይቃል፤ አንድ ሰው ያጸድቃል፤ መጋዘኑም የጸደቀውን ያወጣል።'
		),
		path: '/dashboard/requisitions',
		steps: [
			t(
				'Under **Stock → Requisitions**, write the request and submit it.',
				'በ**ክምችት → የዕቃ ጥያቄዎች** ጥያቄውን ጽፈው ያስገቡ።'
			),
			t(
				'Someone else approves it, cutting quantities if need be, or rejects it with a reason.',
				'ሌላ ሰው ያጸድቀዋል፤ ካስፈለገ ብዛቱን ይቀንሳል፤ ወይም በምክንያት ውድቅ ያደርገዋል።'
			),
			t(
				'**Issue** drafts the store issue with the approved quantities; posting it marks the request issued.',
				'**አውጣ** በጸደቀው ብዛት የወጪ ረቂቅ ያዘጋጃል፤ መመዝገቡ ጥያቄውን እንደወጣ ያደርገዋል።'
			)
		],
		keywords: ['requisition', 'request', 'department', 'ward', 'site', 'ጥያቄ', 'ክፍል'],
		roles: ['owner', 'manager', 'storekeeper', 'clerk', 'department']
	},

	// ── Selling ────────────────────────────────────────────────────────────────────────────
	{
		id: 'till',
		section: 'selling',
		title: t('Selling at the till', 'በካሽ መመዝገቢያ መሸጥ'),
		summary: t(
			'Open a shift, ring up the sale, take the payment, print the receipt. Stock and money are recorded together.',
			'ፈረቃ ይክፈቱ፣ ሽያጩን ይመዝግቡ፣ ክፍያውን ይቀበሉ፣ ደረሰኙን ያትሙ። ክምችትና ገንዘብ አብረው ይመዘገባሉ።'
		),
		path: '/dashboard/pos',
		tour: 'pos',
		steps: [
			t(
				'Open **Sales → Till (POS)**, choose where you sell from and the opening cash, and click **Open shift**.',
				'**ሽያጭ → ካሽ መመዝገቢያ (POS)**ን ይክፈቱ፤ የሚሸጡበትን ቦታና የመነሻ ጥሬ ገንዘብ ይምረጡ፤ **ፈረቃ ክፈት**ን ይጫኑ።'
			),
			t(
				'Scan or search items to add them. Choose a customer if the sale is on credit or on their price list.',
				'ዕቃዎችን ለመጨመር ይቃኙ ወይም ይፈልጉ። ሽያጩ በዱቤ ወይም በደንበኛው የዋጋ ዝርዝር ከሆነ ደንበኛ ይምረጡ።'
			),
			t(
				'Take the payment: cash, Telebirr, bank, or split between them, and print the receipt.',
				'ክፍያውን ይቀበሉ፦ ጥሬ ገንዘብ፣ ቴሌብር፣ ባንክ፣ ወይም በመካከላቸው ተከፋፍሎ፤ ደረሰኙንም ያትሙ።'
			),
			t(
				'At the end of the day, close the shift and count the drawer. A shortage is recorded against the shift.',
				'በቀኑ መጨረሻ ፈረቃውን ይዝጉና ገንዘቡን ይቁጠሩ። ጉድለት ካለ በፈረቃው ላይ ይመዘገባል።'
			)
		],
		notes: [
			t(
				'Hold a cart to serve someone else, and bring it back later.',
				'ሌላ ሰው ለማስተናገድ ጋሪውን ያቆዩ፤ በኋላ ይመልሱት።'
			),
			t(
				"Discounts above the business's limit need the right to give them.",
				'ከድርጅቱ ገደብ በላይ ቅናሽ መስጠት መብት ይፈልጋል።'
			)
		],
		keywords: ['pos', 'cashier', 'shift', 'receipt', 'sale', 'drawer', 'ካሽ', 'ፈረቃ', 'ደረሰኝ'],
		roles: SELLS
	},
	{
		id: 'proformas',
		section: 'selling',
		title: t('Proformas', 'ፕሮፎርማዎች'),
		summary: t(
			'A price offer for a customer, printable, which becomes a sale when they accept.',
			'ለደንበኛ የሚሰጥ የዋጋ ቅናሽ፤ የሚታተም፤ ሲቀበሉት ወደ ሽያጭ ይቀየራል።'
		),
		path: '/dashboard/sales/quotes',
		steps: [
			t(
				'Open **Sales → Proformas**, create one for the customer and add the lines.',
				'**ሽያጭ → ፕሮፎርማዎች**ን ይክፈቱ፤ ለደንበኛው አንድ ይፍጠሩና መስመሮቹን ይጨምሩ።'
			),
			t(
				'Print it or send it. Mark it **accepted** when they agree.',
				'ያትሙት ወይም ይላኩት። ሲስማሙ **ተቀባይነት አግኝቷል** ብለው ምልክት ያድርጉ።'
			),
			t('Turn it into a sale in one click.', 'በአንድ ጠቅታ ወደ ሽያጭ ይቀይሩት።')
		],
		notes: [
			t(
				'With **Hold stock** switched on in the Business profile, an accepted proforma keeps its stock for that customer.',
				'በድርጅት መረጃ **ክምችት ያዝ** ከበራ፣ ተቀባይነት ያገኘ ፕሮፎርማ ክምችቱን ለዚያ ደንበኛ ይይዛል።'
			)
		],
		keywords: ['quote', 'quotation', 'proforma', 'offer', 'ፕሮፎርማ', 'ዋጋ'],
		roles: SELLS
	},
	{
		id: 'credit',
		section: 'selling',
		title: t('Selling on credit (ዱቤ)', 'በዱቤ መሸጥ'),
		summary: t(
			'Each customer can have a credit limit and days to pay. The system ages what they owe and refuses a sale over the limit.',
			'እያንዳንዱ ደንበኛ የዱቤ ጣሪያና የመክፈያ ቀናት ሊኖረው ይችላል። ሥርዓቱ ዕዳውን በዕድሜ ይከፍላል፤ ከጣሪያ በላይ ሽያጭን ውድቅ ያደርጋል።'
		),
		path: '/dashboard/customers/credit',
		steps: [
			t(
				'Open the customer and set the **credit limit** (empty: no limit, 0: cash only) and **credit days**.',
				'ደንበኛውን ይክፈቱና **የዱቤ ጣሪያ** (ባዶ፦ ገደብ የለም፣ 0፦ ጥሬ ገንዘብ ብቻ) እና **የዱቤ ቀናትን** ያስቀምጡ።'
			),
			t(
				'**Customers → Credit & ageing** shows who owes what and how late.',
				'**ደንበኞች → ዱቤ እና የዕዳ ዕድሜ** ማን ምን ያህል እንዳለበት እና ምን ያህል እንደዘገየ ያሳያል።'
			),
			t(
				'Print a customer **statement**, or text them a reminder when SMS is on.',
				'የደንበኛ **የሂሳብ መግለጫ** ያትሙ፣ ወይም SMS ከበራ የማስታወሻ መልዕክት ይላኩ።'
			)
		],
		keywords: ['credit', 'debt', 'owe', 'ageing', 'statement', 'limit', 'ዱቤ', 'ዕዳ'],
		roles: ['owner', 'manager', 'cashier', 'clerk']
	},
	{
		id: 'returns',
		section: 'selling',
		title: t('Returns', 'ተመላሾች'),
		summary: t(
			'A return always starts from the sale or delivery it undoes, so it can never return more than was sold.',
			'ተመላሽ ሁልጊዜ ከሚሰርዘው ሽያጭ ወይም ገቢ ይጀምራል፤ ስለዚህ ከተሸጠው በላይ ሊመልስ አይችልም።'
		),
		path: '/dashboard/stock/documents',
		steps: [
			t(
				'Open the posted sale and click **Customer return**, or the posted receipt and click **Return to supplier**.',
				'የተመዘገበውን ሽያጭ ይክፈቱና **የደንበኛ ተመላሽ**ን፣ ወይም የተመዘገበውን የዕቃ ገቢ ይክፈቱና **ለአቅራቢ ተመላሽ**ን ይጫኑ።'
			),
			t(
				'Enter what comes back; lots and serials go back where they came from. Post it.',
				'የሚመለሰውን ያስገቡ፤ ሎቶችና ሲሪያሎች ወደመጡበት ይመለሳሉ። ይመዝግቡት።'
			)
		],
		keywords: ['return', 'refund', 'credit note', 'ተመላሽ'],
		roles: WORKS_THE_STORE
	},

	// ── Buying ─────────────────────────────────────────────────────────────────────────────
	{
		id: 'suppliers',
		section: 'buying',
		title: t('Suppliers and what you owe them', 'አቅራቢዎች እና ያለብዎ ዕዳ'),
		summary: t(
			"Each supplier's page shows what they delivered, what you paid and what is still owed.",
			'የእያንዳንዱ አቅራቢ ገጽ ያቀረበውን፣ የከፈሉትን እና ገና ያለብዎትን ያሳያል።'
		),
		path: '/dashboard/suppliers',
		tour: 'suppliers',
		steps: [
			t(
				'Open **Suppliers** and click **Add supplier**: a name and phone are enough.',
				'**አቅራቢዎች**ን ይክፈቱና **አቅራቢ ጨምር**ን ይጫኑ፦ ስምና ስልክ በቂ ናቸው።'
			),
			t(
				'Record a payment to them from the receipt it pays, or under **Transactions**.',
				'ክፍያቸውን ከሚከፍለው የዕቃ ገቢ ላይ፣ ወይም በ**ግብይቶች** ይመዝግቡ።'
			)
		],
		keywords: ['vendor', 'supplier', 'payable', 'owe', 'አቅራቢ'],
		roles: WORKS_THE_STORE
	},
	{
		id: 'purchase-orders',
		section: 'buying',
		title: t('Purchase orders', 'የግዢ ትዕዛዞች'),
		summary: t(
			'Order from a supplier, send the order, and receive the delivery against it in part or in full.',
			'ከአቅራቢ ያዝዙ፣ ትዕዛዙን ይላኩ፣ ገቢውንም በከፊል ወይም በሙሉ ከትዕዛዙ ጋር ይረከቡ።'
		),
		path: '/dashboard/purchasing',
		steps: [
			t(
				'Open **Purchasing → Purchase orders**, draft an order and add the lines.',
				'**ግዢ → የግዢ ትዕዛዞች**ን ይክፈቱ፤ ትዕዛዝ ያዘጋጁና መስመሮቹን ይጨምሩ።'
			),
			t(
				'**Mark as ordered**, then print or email it to the supplier.',
				'**እንደታዘዘ ምልክት አድርግ**፣ ከዚያ ያትሙት ወይም ለአቅራቢው በኢሜይል ይላኩት።'
			),
			t(
				'When the goods arrive, **Receive delivery** drafts the receipt with what is still due.',
				'ዕቃው ሲደርስ **ርክክቡን ተረከብ** የቀረውን የያዘ የዕቃ ገቢ ረቂቅ ያዘጋጃል።'
			)
		],
		keywords: ['po', 'purchase order', 'order', 'buy', 'ትዕዛዝ', 'ግዢ'],
		roles: RUNS_THE_BUSINESS
	},
	{
		id: 'reorder',
		section: 'buying',
		title: t('Knowing what to reorder', 'መታዘዝ ያለበትን ማወቅ'),
		summary: t(
			'Items at or below their reorder level are listed, with how much to order from what actually sells.',
			'በማዘዣ ደረጃቸው ወይም ከዚያ በታች ያሉ ዕቃዎች ይዘረዘራሉ፤ ከትክክለኛ ሽያጭ የተሰላ የሚታዘዝ ብዛትም አብሮ።'
		),
		path: '/dashboard/purchasing/reorder',
		steps: [
			t(
				"Set a **reorder level** on each item, or per store on the item's page.",
				'በእያንዳንዱ ዕቃ ላይ፣ ወይም በዕቃው ገጽ ላይ በመጋዘን፣ **የማዘዣ ደረጃ** ያስቀምጡ።'
			),
			t(
				'Open **Purchasing → Reorder** and turn the suggestions into purchase orders.',
				'**ግዢ → እንደገና ማዘዝ**ን ይክፈቱና ምክሮቹን ወደ የግዢ ትዕዛዝ ይቀይሩ።'
			)
		],
		keywords: ['reorder', 'minimum', 'low stock', 'running out', 'ማዘዣ', 'እጥረት'],
		roles: RUNS_THE_BUSINESS
	},

	// ── Money ──────────────────────────────────────────────────────────────────────────────
	{
		id: 'payments',
		section: 'money',
		title: t('Recording money in and out', 'ገቢና ወጪ ገንዘብ መመዝገብ'),
		summary: t(
			'Every payment is a transaction with its method, reference and the slip that proves it.',
			'እያንዳንዱ ክፍያ ከዘዴው፣ ከማጣቀሻው እና ከሚያረጋግጠው ደረሰኝ ጋር ግብይት ነው።'
		),
		path: '/dashboard/transactions',
		steps: [
			t(
				'Open **Transactions** and click **Record a transaction**, or record it from the document it pays.',
				'**ግብይቶች**ን ይክፈቱና **ግብይት መዝግብ**ን ይጫኑ፣ ወይም ከሚከፍለው ሰነድ ላይ ይመዝግቡት።'
			),
			t(
				'Choose the method (cash, Telebirr, bank…), type the reference, and attach a screenshot or PDF of the slip.',
				'ዘዴውን (ጥሬ ገንዘብ፣ ቴሌብር፣ ባንክ…) ይምረጡ፣ ማጣቀሻውን ይጻፉ፣ የደረሰኙን ስክሪንሾት ወይም PDF ያያይዙ።'
			)
		],
		notes: [
			t(
				'A reference already used on another transaction is refused, so the same slip cannot be recorded twice.',
				'በሌላ ግብይት ላይ የተጠቀመ ማጣቀሻ ውድቅ ይደረጋል፤ ስለዚህ አንድ ደረሰኝ ሁለት ጊዜ ሊመዘገብ አይችልም።'
			),
			t(
				'Mistakes are **voided**, never deleted, so the record stays whole.',
				'ስህተቶች **ውድቅ ይደረጋሉ** እንጂ አይጠፉም፤ ስለዚህ መዝገቡ ሙሉ ይቆያል።'
			)
		],
		keywords: [
			'payment',
			'transaction',
			'telebirr',
			'cbe birr',
			'bank',
			'cash',
			'reference',
			'void',
			'ክፍያ',
			'ግብይት'
		],
		roles: HANDLES_MONEY
	},
	{
		id: 'verify',
		section: 'money',
		title: t('Checking payments against the statement', 'ክፍያዎችን ከባንክ መግለጫ ጋር ማረጋገጥ'),
		summary: t(
			'A second person marks each transaction verified after finding it on the bank or Telebirr statement.',
			'ሁለተኛ ሰው እያንዳንዱን ግብይት በባንክ ወይም በቴሌብር መግለጫ ላይ ካገኘው በኋላ እንደተረጋገጠ ምልክት ያደርጋል።'
		),
		path: '/dashboard/transactions',
		steps: [
			t('Filter **Transactions** to **not verified**.', '**ግብይቶች**ን ወደ **ያልተረጋገጡ** ያጣሩ።'),
			t(
				'Open each one, compare it with the statement, and click **Verify**.',
				'እያንዳንዱን ይክፈቱ፣ ከመግለጫው ጋር ያነጻጽሩ፣ **አረጋግጥ**ን ይጫኑ።'
			)
		],
		notes: [
			t(
				'Whoever recorded a transaction cannot verify it; owners excepted.',
				'ግብይቱን የመዘገበ ሰው ሊያረጋግጠው አይችልም፤ ባለቤቶች ግን ይችላሉ።'
			)
		],
		keywords: ['verify', 'reconcile', 'statement', 'check', 'ማረጋገጥ'],
		roles: RUNS_THE_BUSINESS
	},
	{
		id: 'tax',
		section: 'money',
		title: t('VAT, TOT and withholding tax', 'ተ.እ.ታ፣ TOT እና ተቀናሽ ግብር'),
		summary: t(
			'Switch on what applies to your business in the Business profile; every document then works the tax out.',
			'በድርጅት መረጃ ለድርጅትዎ የሚመለከተውን ያብሩ፤ ከዚያ እያንዳንዱ ሰነድ ግብሩን ያሰላል።'
		),
		path: '/dashboard/admin-panel/business',
		steps: [
			t(
				'Open **Admin panel → Business profile**: VAT registration and rate, turnover tax (TOT), and whether you are a withholding agent.',
				'**የአስተዳደር ገጽ → የድርጅት መረጃ**ን ይክፈቱ፦ የተ.እ.ታ ምዝገባና ተመን፣ የተርን ኦቨር ታክስ (TOT)፣ እና ተቀናሽ ግብር ወኪል መሆንዎን።'
			),
			t(
				'Mark suppliers who are VAT-registered, and customers who withhold from what they pay you.',
				'ለተ.እ.ታ የተመዘገቡ አቅራቢዎችን፣ እና ከሚከፍሉዎት ላይ የሚቀንሱ ደንበኞችን ምልክት ያድርጉ።'
			)
		],
		notes: [
			t(
				'The rate on a line is fixed when the document is posted, so changing a rate later never changes old invoices.',
				'በመስመሩ ላይ ያለው ተመን ሰነዱ ሲመዘገብ ይጸናል፤ ስለዚህ በኋላ ተመን መቀየር የድሮ ደረሰኞችን በፍጹም አይቀይርም።'
			)
		],
		keywords: ['vat', 'tot', 'withholding', 'tin', 'tax', 'fiscal', 'ግብር', 'ተ.እ.ታ'],
		roles: RUNS_THE_BUSINESS
	},
	{
		id: 'sms',
		section: 'money',
		title: t('Text messages to customers', 'ለደንበኞች አጭር የጽሑፍ መልዕክት'),
		summary: t(
			'Send receipts, payment confirmations and credit reminders by SMS. Off until you switch it on.',
			'ደረሰኝ፣ የክፍያ ማረጋገጫ እና የዱቤ ማስታወሻ በ SMS ይላኩ። እስኪያበሩት ድረስ ጠፍቷል።'
		),
		path: '/dashboard/admin-panel/sms',
		steps: [
			t(
				'Open **Admin panel → SMS** and switch it on. Choose which automatic messages to send, if any.',
				'**የአስተዳደር ገጽ → SMS**ን ይክፈቱና ያብሩት። ካሉ የትኞቹ ራስ-ሰር መልዕክቶች እንደሚላኩ ይምረጡ።'
			),
			t(
				"From a customer's page, send a credit reminder or a note by hand.",
				'ከደንበኛው ገጽ የዱቤ ማስታወሻ ወይም ማስታወሻ በእጅ ይላኩ።'
			),
			t(
				'Every message sent, and what the provider answered, is in the SMS log.',
				'እያንዳንዱ የተላከ መልዕክት እና አቅራቢው የሰጠው መልስ በ SMS መዝገብ ውስጥ አለ።'
			)
		],
		notes: [
			t(
				'Texts are real and reach real phones. Send a test to your own number first.',
				'መልዕክቶቹ እውነተኛ ናቸው፤ እውነተኛ ስልኮችን ይደርሳሉ። መጀመሪያ ለራስዎ ቁጥር ሙከራ ይላኩ።'
			)
		],
		keywords: ['sms', 'text', 'message', 'reminder', 'geez', 'መልዕክት'],
		roles: RUNS_THE_BUSINESS
	},

	// ── People ─────────────────────────────────────────────────────────────────────────────
	{
		id: 'add-user',
		section: 'people',
		title: t('Adding a member of staff', 'ሠራተኛ መጨመር'),
		summary: t(
			'Each person signs in with their own email and password, and sees only what their role allows.',
			'እያንዳንዱ ሰው በራሱ ኢሜይልና የይለፍ ቃል ይገባል፤ ሚናው የሚፈቅደውን ብቻ ያያል።'
		),
		path: '/dashboard/admin-panel/users',
		tour: 'users',
		steps: [
			t(
				'Open **Admin panel → Users** and click **Add user**.',
				'**የአስተዳደር ገጽ → ተጠቃሚዎች**ን ይክፈቱና **ተጠቃሚ ጨምር**ን ይጫኑ።'
			),
			t(
				'Enter their name, email and a first password, and choose a **role**: Manager, Cashier, Storekeeper, Clerk or Department.',
				'ስማቸውን፣ ኢሜይላቸውን እና የመጀመሪያ የይለፍ ቃል ያስገቡ፤ **ሚና** ይምረጡ፦ ሥራ አስኪያጅ፣ ገንዘብ ተቀባይ፣ ግምጃ ቤት ኃላፊ፣ ጸሐፊ ወይም ክፍል።'
			),
			t(
				'Tell them the password; they can change it from their account menu.',
				'የይለፍ ቃሉን ይንገሯቸው፤ ከመለያቸው ማውጫ መቀየር ይችላሉ።'
			)
		],
		notes: [
			t(
				'Your package allows a number of users. Switch off someone who has left to free a place.',
				'ፓኬጅዎ የተወሰነ የተጠቃሚ ብዛት ይፈቅዳል። ቦታ ለማስለቀቅ የለቀቀውን ሰው መለያ ያጥፉ።'
			)
		],
		keywords: ['user', 'staff', 'employee', 'invite', 'account', 'login', 'ተጠቃሚ', 'ሠራተኛ'],
		roles: RUNS_THE_BUSINESS
	},
	{
		id: 'roles',
		section: 'people',
		title: t('Roles and permissions', 'ሚናዎች እና ፈቃዶች'),
		summary: t(
			'A role is a set of permissions. Change the ready-made ones or make your own.',
			'ሚና የፈቃዶች ስብስብ ነው። የተዘጋጁትን ይቀይሩ ወይም የራስዎን ይፍጠሩ።'
		),
		path: '/dashboard/admin-panel/roles',
		steps: [
			t(
				'Open **Admin panel → Roles**, open a role, and tick what it may do.',
				'**የአስተዳደር ገጽ → ሚናዎች**ን ይክፈቱ፣ ሚና ይክፈቱ፣ ሊያደርገው የሚችለውን ምልክት ያድርጉ።'
			),
			t(
				'To give one person something different, open them under **Users** and set their own permissions.',
				'ለአንድ ሰው የተለየ ነገር ለመስጠት በ**ተጠቃሚዎች** ይክፈቷቸውና የራሳቸውን ፈቃዶች ያስቀምጡ።'
			)
		],
		notes: [
			t(
				'You can only give permissions you hold yourself, and the business always keeps at least one active owner.',
				'መስጠት የሚችሉት እርስዎ ያለዎትን ፈቃድ ብቻ ነው፤ ድርጅቱም ሁልጊዜ ቢያንስ አንድ ንቁ ባለቤት ይኖረዋል።'
			)
		],
		keywords: ['role', 'permission', 'access', 'rights', 'ሚና', 'ፈቃድ'],
		roles: ['owner']
	},
	{
		id: 'branches',
		section: 'people',
		title: t('Branches, stores, and keeping staff to one', 'ቅርንጫፎች፣ መጋዘኖች፣ እና ሠራተኞችን በአንዱ መወሰን'),
		summary: t(
			'Add branches and the stores inside them; staff can be kept to the branches they work in.',
			'ቅርንጫፎችን እና በውስጣቸው ያሉ መጋዘኖችን ይጨምሩ፤ ሠራተኞች በሚሠሩባቸው ቅርንጫፎች ሊወሰኑ ይችላሉ።'
		),
		path: '/dashboard/admin-panel/branches',
		steps: [
			t(
				'**Admin panel → Branches** for each shop or site; **Locations** for the stores, shelves and fridges inside them.',
				'ለእያንዳንዱ ሱቅ ወይም ቦታ **የአስተዳደር ገጽ → ቅርንጫፎች**፤ በውስጣቸው ላሉ መጋዘኖች፣ መደርደሪያዎችና ማቀዝቀዣዎች **ቦታዎች**።'
			),
			t(
				'Under **Users**, open a person and set **Works in** to keep them to their branches.',
				'በ**ተጠቃሚዎች** ሰውየውን ይክፈቱና በቅርንጫፎቻቸው ለመወሰን **የሚሠራባቸው**ን ያስቀምጡ።'
			)
		],
		keywords: ['branch', 'location', 'store', 'warehouse', 'shelf', 'ቅርንጫፍ', 'መጋዘን'],
		roles: RUNS_THE_BUSINESS
	},
	{
		id: 'approvals',
		section: 'people',
		title: t('Approvals by a second person', 'በሁለተኛ ሰው ማጽደቅ'),
		summary: t(
			'Large adjustments, write-offs, count differences and purchase orders can wait for someone else to approve them.',
			'ትልልቅ ማስተካከያዎች፣ ከሂሳብ መሰረዝ፣ የቆጠራ ልዩነቶች እና የግዢ ትዕዛዞች ሌላ ሰው እስኪያጸድቃቸው ሊጠብቁ ይችላሉ።'
		),
		path: '/dashboard/approvals',
		steps: [
			t(
				'Set the limits in **Admin panel → Business profile → Approvals**. Empty means no approval needed.',
				'ገደቦቹን በ**የአስተዳደር ገጽ → የድርጅት መረጃ → ማጽደቅ** ያስቀምጡ። ባዶ ማለት ማጽደቅ አያስፈልግም ማለት ነው።'
			),
			t(
				'Anything over a limit waits under **Approvals**, where another person approves or rejects it with a reason.',
				'ከገደብ በላይ የሆነ ማንኛውም ነገር በ**ማጽደቂያዎች** ይጠብቃል፤ እዚያ ሌላ ሰው በምክንያት ያጸድቀዋል ወይም ውድቅ ያደርገዋል።'
			)
		],
		notes: [t('Nobody can approve their own request.', 'ማንም የራሱን ጥያቄ ማጽደቅ አይችልም።')],
		keywords: ['approval', 'maker checker', 'limit', 'write-off', 'ማጽደቅ'],
		roles: RUNS_THE_BUSINESS
	},

	// ── Account ────────────────────────────────────────────────────────────────────────────
	{
		id: 'subscription',
		section: 'account',
		title: t('Your package and paying for it', 'ፓኬጅዎ እና ክፍያው'),
		summary: t(
			'Subscription shows your package, your last payment and what is due. Pay online with Chapa, or by bank transfer with a photo of the receipt.',
			'«ፓኬጅ እና ክፍያ» ፓኬጅዎን፣ የመጨረሻ ክፍያዎን እና የሚጠበቀውን ያሳያል። በ Chapa በኦንላይን፣ ወይም በባንክ ዝውውር ከደረሰኙ ፎቶ ጋር ይክፈሉ።'
		),
		path: '/dashboard/subscription',
		tour: 'subscription',
		steps: [
			t(
				'Open your **account** menu (top right) and choose **Subscription**.',
				'**መለያዎን** (ከላይ በቀኝ) ይክፈቱና **ፓኬጅ እና ክፍያ**ን ይምረጡ።'
			),
			t(
				'Choose the package. Every package has every feature; they differ in people, branches and how often you pay.',
				'ፓኬጁን ይምረጡ። እያንዳንዱ ፓኬጅ ሁሉም አገልግሎት አለው፤ የሚለያዩት በሰው፣ በቅርንጫፍ እና በክፍያ ጊዜ ነው።'
			),
			t(
				'**Pay with Chapa** (Telebirr, CBE Birr, cards), or **Pay by bank transfer**: transfer to one of the accounts shown and upload a screenshot or PDF of the receipt.',
				'**በ Chapa ይክፈሉ** (ቴሌብር፣ CBE ብር፣ ካርድ)፣ ወይም **በባንክ ዝውውር ይክፈሉ**፦ ከሚታዩት ሂሳቦች ወደ አንዱ ያስተላልፉና የደረሰኙን ስክሪንሾት ወይም PDF ይጫኑ።'
			)
		],
		notes: [
			t(
				'Paying early loses nothing: a payment extends from the day the current period ends.',
				'ቀድሞ መክፈል ምንም አያሳጣም፦ ክፍያ የሚያራዝመው አሁን ያለው ጊዜ ከሚያበቃበት ቀን ጀምሮ ነው።'
			),
			t(
				'A bank transfer counts once Digital Construct has checked the receipt; you see its status on the same page.',
				'የባንክ ዝውውር የሚቆጠረው Digital Construct ደረሰኙን ካረጋገጠ በኋላ ነው፤ ሁኔታውን በዚያው ገጽ ያያሉ።'
			)
		],
		keywords: [
			'subscription',
			'package',
			'plan',
			'pay',
			'chapa',
			'bank',
			'receipt',
			'trial',
			'price',
			'ፓኬጅ',
			'ክፍያ'
		],
		roles: ['owner']
	},
	{
		id: 'blocked',
		section: 'account',
		title: t('When the business is blocked', 'ድርጅቱ ሲታገድ'),
		summary: t(
			'If the trial ends unpaid, or a payment is more than seven days late, every page leads to Subscription until it is paid. Nothing is deleted.',
			'ሙከራው ሳይከፈል ካበቃ፣ ወይም ክፍያ ከሰባት ቀን በላይ ከዘገየ፣ እስኪከፈል ድረስ እያንዳንዱ ገጽ ወደ «ፓኬጅ እና ክፍያ» ይወስዳል። ምንም አይጠፋም።'
		),
		path: '/dashboard/subscription',
		steps: [
			t(
				'The owner pays on the **Subscription** page. Chapa payments count at once.',
				'ባለቤቱ በ**ፓኬጅ እና ክፍያ** ገጽ ይከፍላል። የ Chapa ክፍያዎች ወዲያውኑ ይቆጠራሉ።'
			),
			t(
				'Everyone else in the business sees why it is blocked, and can work again as soon as it is paid.',
				'በድርጅቱ ያለ ሌላው ሁሉ ለምን እንደታገደ ያያል፤ እንደተከፈለ ወደ ሥራ መመለስ ይችላል።'
			)
		],
		keywords: ['blocked', 'locked', 'suspended', 'payment issue', 'late', 'ታግዷል'],
		roles: EVERYONE
	},
	{
		id: 'password',
		section: 'account',
		title: t('Changing or resetting your password', 'የይለፍ ቃል መቀየር ወይም ዳግም ማስጀመር'),
		summary: t(
			'Change it from your account menu. Forgotten it? The sign-in page emails you a link.',
			'ከመለያዎ ማውጫ ይቀይሩት። ረስተውታል? የመግቢያ ገጹ ማስፈንጠሪያ በኢሜይል ይልክልዎታል።'
		),
		path: '/dashboard/change-password',
		steps: [
			t(
				'Open your **account** menu and choose **Change password**.',
				'**መለያዎን** ይክፈቱና **የይለፍ ቃል ቀይር**ን ይምረጡ።'
			),
			t(
				'Forgotten it: on the sign-in page, click **Forgot your password?** and follow the link in the email within an hour.',
				'ከረሱት፦ በመግቢያ ገጹ **የይለፍ ቃልዎን ረስተዋል?**ን ይጫኑ፤ በኢሜይሉ ያለውን ማስፈንጠሪያ በአንድ ሰዓት ውስጥ ይከተሉ።'
			)
		],
		notes: [
			t(
				'An owner can also set a new password for a member of staff from their page under **Users**.',
				'ባለቤት ለሠራተኛም በ**ተጠቃሚዎች** ስር ካለው ገጻቸው አዲስ የይለፍ ቃል ማስቀመጥ ይችላል።'
			)
		],
		keywords: ['password', 'forgot', 'reset', 'login', 'sign in', 'የይለፍ ቃል'],
		roles: EVERYONE
	}
];

/** Every article's text, in both languages, lowercased: what the search box looks through. */
export function searchText(topic: HelpTopic): string {
	const parts: Text[] = [
		topic.title,
		topic.summary,
		...(topic.steps ?? []),
		...(topic.notes ?? [])
	];
	return [...parts.flatMap((p) => [p.en, p.am]), ...(topic.keywords ?? [])]
		.join(' ')
		.replace(/\*\*/g, '')
		.toLowerCase();
}

/**
 * The articles about the page at `pathname`: the ones whose screen is that page, else the ones
 * about the nearest screen above it (an item's page shows the Items articles).
 */
export function topicsForPath(pathname: string): HelpTopic[] {
	const path = pathname.replace(/\/+$/, '') || '/';
	const withPath = HELP_TOPICS.filter((topic) => topic.path);
	const exact = withPath.filter((topic) => topic.path === path);
	if (exact.length) return exact;

	let best = '';
	for (const topic of withPath) {
		const p = topic.path!;
		if (p !== '/dashboard' && path.startsWith(p + '/') && p.length > best.length) best = p;
	}
	return best ? withPath.filter((topic) => topic.path === best) : [];
}
