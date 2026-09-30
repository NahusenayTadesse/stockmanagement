/**
 * Guided tours: a few steps on one screen, each pointing at something on it. A tour is started
 * by opening its screen with `?tour=<id>` — from "Show me" in the help, the getting-started
 * guide, or the help button — and `TourRunner` in the dashboard layout plays it.
 *
 * A step points at an element marked `data-tour="<target>"`, or at the first element matching
 * `within` inside it (the kit renders some buttons this app cannot mark). A step whose target is
 * not on the screen for this viewer (a button their role does not have, a phone's hidden menu)
 * is skipped when `optional`, and otherwise shown in the middle of the screen.
 */
import { resolve } from '$app/paths';
import type { Text } from './content';

const t = (en: string, am: string): Text => ({ en, am });

export type TourStep = {
	target: string;
	within?: string;
	title: Text;
	body: Text;
	optional?: boolean;
};

export type Tour = {
	id: string;
	/** The screen the tour runs on. */
	path: string;
	steps: TourStep[];
};

export const TOURS: Tour[] = [
	{
		id: 'welcome',
		path: '/dashboard',
		steps: [
			{
				target: 'getting-started',
				optional: true,
				title: t('Your getting-started guide', 'የመጀመሪያ መመሪያዎ'),
				body: t(
					'Seven steps take your business from empty to its first sale. Each is ticked off as you do it, and **Show me** takes you there.',
					'ሰባት እርምጃዎች ድርጅትዎን ከባዶ እስከ መጀመሪያው ሽያጭ ያደርሳሉ። ሲያደርጉት እያንዳንዱ ምልክት ይደረግበታል፤ **አሳየኝ** ወደዚያ ይወስድዎታል።'
				)
			},
			{
				target: 'sidebar',
				optional: true,
				title: t('The menu', 'ማውጫው'),
				body: t(
					'Everything your role may open is here. Entries with an arrow open to show the screens inside them.',
					'ሚናዎ የሚከፍተው ሁሉ እዚህ አለ። ቀስት ያላቸው ግቤቶች ሲከፈቱ በውስጣቸው ያሉትን ገጾች ያሳያሉ።'
				)
			},
			{
				target: 'search',
				title: t('Jump anywhere', 'ወደ ማንኛውም ቦታ ይሂዱ'),
				body: t(
					'Type the name of a screen, such as "transfers" or "reorder", and go straight to it.',
					'የገጹን ስም ይጻፉ፤ ለምሳሌ «ዝውውር» ወይም «ማዘዝ»፤ በቀጥታ ወደዚያ ይሂዱ።'
				)
			},
			{
				target: 'language',
				title: t('English or አማርኛ', 'English ወይም አማርኛ'),
				body: t(
					'Switch the whole system between English and Amharic. Everyone chooses their own.',
					'ሥርዓቱን በሙሉ በእንግሊዝኛና በአማርኛ መካከል ይቀያይሩ። እያንዳንዱ ሰው የራሱን ይመርጣል።'
				)
			},
			{
				target: 'account',
				title: t('Your account', 'መለያዎ'),
				body: t(
					'Change your password, see your package and payments under **Subscription**, or sign out.',
					'የይለፍ ቃልዎን ይቀይሩ፣ ፓኬጅዎንና ክፍያዎችዎን በ**ፓኬጅ እና ክፍያ** ይመልከቱ፣ ወይም ይውጡ።'
				)
			},
			{
				target: 'help-button',
				title: t('Help, whenever you need it', 'እገዛ፣ በፈለጉት ጊዜ'),
				body: t(
					'This button explains the screen you are on and can walk you around it. The help centre answers everything else.',
					'ይህ ቁልፍ ያሉበትን ገጽ ያብራራል፣ ገጹንም ሊያስጎበኝዎት ይችላል። ሌላውን ሁሉ የእገዛ ማዕከሉ ይመልሳል።'
				)
			}
		]
	},
	{
		id: 'business',
		path: '/dashboard/admin-panel/business',
		steps: [
			{
				target: 'business-details',
				title: t('Your business details', 'የድርጅትዎ መረጃ'),
				body: t(
					'The name, TIN, phone and address here print on every invoice, receipt and voucher. Taxes and approval limits are set further down.',
					'እዚህ ያሉት ስም፣ TIN፣ ስልክ እና አድራሻ በእያንዳንዱ ደረሰኝና ሰነድ ላይ ይታተማሉ። ግብሮችና የማጽደቅ ገደቦች ከሥር ይቀመጣሉ።'
				)
			},
			{
				target: 'business-save',
				title: t('Save the details', 'መረጃውን ያስቀምጡ'),
				body: t('Nothing changes until you click **Save**.', '**አስቀምጥ**ን እስኪጫኑ ድረስ ምንም አይቀየርም።')
			},
			{
				target: 'business-logo',
				optional: true,
				title: t('Your logo', 'አርማዎ'),
				body: t(
					'Upload your logo: it shows in the menu and at the top of printed documents.',
					'አርማዎን ይጫኑ፦ በማውጫው እና በሚታተሙ ሰነዶች ራስ ላይ ይታያል።'
				)
			}
		]
	},
	{
		id: 'items',
		path: '/dashboard/items',
		steps: [
			{
				target: 'items-list',
				within: 'button',
				title: t('Add an item', 'ዕቃ ይጨምሩ'),
				body: t(
					'Click here to add an item: its code, name, unit, price and main supplier. Everything you stock or sell is an item.',
					'ዕቃ ለመጨመር እዚህ ይጫኑ፦ ኮዱ፣ ስሙ፣ መለኪያው፣ ዋጋው እና ዋና አቅራቢው። የሚያከማቹት ወይም የሚሸጡት ሁሉ ዕቃ ነው።'
				)
			},
			{
				target: 'items-list',
				title: t('Your items', 'ዕቃዎችዎ'),
				body: t(
					"Click an item's name to open it: packs, barcodes, its bin card and reorder levels.",
					'ዕቃውን ለመክፈት ስሙን ይጫኑ፦ ጥቅሎች፣ ባርኮዶች፣ የቢን ካርዱ እና የማዘዣ ደረጃዎች።'
				)
			},
			{
				target: 'items-labels',
				optional: true,
				title: t('Labels and barcodes', 'መለያዎች እና ባርኮዶች'),
				body: t(
					'Print shelf labels with barcodes for any items you choose.',
					'ለመረጧቸው ዕቃዎች ባርኮድ ያላቸው የመደርደሪያ መለያዎችን ያትሙ።'
				)
			}
		]
	},
	{
		id: 'suppliers',
		path: '/dashboard/suppliers',
		steps: [
			{
				target: 'suppliers-add',
				title: t('Add a supplier', 'አቅራቢ ይጨምሩ'),
				body: t(
					'A name and a phone number are enough. Items that keep stock each need a main supplier.',
					'ስምና ስልክ ቁጥር በቂ ናቸው። ክምችት የሚይዝ እያንዳንዱ ዕቃ ዋና አቅራቢ ያስፈልገዋል።'
				)
			}
		]
	},
	{
		id: 'documents',
		path: '/dashboard/stock/documents',
		steps: [
			{
				target: 'documents-new',
				title: t('Start a document', 'ሰነድ ይጀምሩ'),
				body: t(
					'Stock changes only through documents. Choose **Receipt** for a delivery, **Issue** to take stock out, **Transfer** to move it, **Adjustment** to correct it.',
					'ክምችት የሚቀየረው በሰነድ ብቻ ነው። ለገቢ **የዕቃ ገቢ**፣ ለማውጣት **ወጪ**፣ ለማዛወር **ዝውውር**፣ ለማረም **ማስተካከያ** ይምረጡ።'
				)
			},
			{
				target: 'documents-list',
				title: t('Drafts, then posted', 'ረቂቅ፣ ከዚያ የተመዘገበ'),
				body: t(
					'A new document is a draft and changes nothing. Open it, add the lines, and click **Post**: then the stock moves.',
					'አዲስ ሰነድ ረቂቅ ነው፤ ምንም አይቀይርም። ይክፈቱት፣ መስመሮቹን ይጨምሩ፣ **መዝግብ**ን ይጫኑ፦ ያኔ ክምችቱ ይንቀሳቀሳል።'
				)
			}
		]
	},
	{
		id: 'pos',
		path: '/dashboard/pos',
		steps: [
			{
				target: 'pos-open',
				optional: true,
				title: t('Open your shift', 'ፈረቃዎን ይክፈቱ'),
				body: t(
					'Choose where you sell from and the cash in the drawer, then **Open shift**. Every sale is recorded against it.',
					'የሚሸጡበትን ቦታ እና በመሳቢያው ያለውን ጥሬ ገንዘብ ይምረጡ፣ ከዚያ **ፈረቃ ክፈት**። እያንዳንዱ ሽያጭ በእሱ ላይ ይመዘገባል።'
				)
			},
			{
				target: 'pos-shift',
				optional: true,
				title: t('Your shift is open', 'ፈረቃዎ ክፍት ነው'),
				body: t(
					'Scan or search items to add them, take the payment and print the receipt. Close the shift at the end of the day to count the drawer.',
					'ዕቃዎችን ለመጨመር ይቃኙ ወይም ይፈልጉ፣ ክፍያውን ይቀበሉ፣ ደረሰኙን ያትሙ። በቀኑ መጨረሻ ገንዘቡን ለመቁጠር ፈረቃውን ይዝጉ።'
				)
			}
		]
	},
	{
		id: 'users',
		path: '/dashboard/admin-panel/users',
		steps: [
			{
				target: 'users-add',
				title: t('Add a member of staff', 'ሠራተኛ ይጨምሩ'),
				body: t(
					'Each person gets their own sign-in and a role, which decides what they see and may do.',
					'እያንዳንዱ ሰው የራሱ መግቢያ እና ሚና ያገኛል፤ ሚናው የሚያየውንና የሚያደርገውን ይወስናል።'
				)
			}
		]
	},
	{
		id: 'subscription',
		path: '/dashboard/subscription',
		steps: [
			{
				target: 'subscription-status',
				title: t('Where you stand', 'ያሉበት ሁኔታ'),
				body: t(
					'Your package, whether the business is active, your last payment, and anything unpaid.',
					'ፓኬጅዎ፣ ድርጅቱ ንቁ መሆኑ፣ የመጨረሻ ክፍያዎ፣ እና ያልተከፈለ ካለ።'
				)
			},
			{
				target: 'subscription-pay',
				optional: true,
				title: t('Paying', 'መክፈል'),
				body: t(
					'Choose a package, then pay online with Chapa or by bank transfer with a photo of the receipt.',
					'ፓኬጅ ይምረጡ፣ ከዚያ በ Chapa በኦንላይን ወይም በባንክ ዝውውር ከደረሰኙ ፎቶ ጋር ይክፈሉ።'
				)
			}
		]
	}
];

export function tourById(id: string | null | undefined): Tour | undefined {
	return id ? TOURS.find((tour) => tour.id === id) : undefined;
}

/** The link that opens a tour's screen with the tour running. */
export function tourHref(tour: Tour): string {
	return `${resolve(tour.path as '/dashboard')}?tour=${tour.id}`;
}
