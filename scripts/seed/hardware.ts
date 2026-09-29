/**
 * A building-materials and hardware store with a warehouse and yard at Bole and a shop in
 * Merkato. Shows: bulk units (bags, bars, bundles, rolls, m³), pack conversions, cement lots that
 * expire, an expired lot moved to quarantine, rental equipment tracked by serial number, a
 * service item, items at their reorder level, and drafts waiting to be posted.
 */
import {
	addBranch,
	addCategories,
	addCustomers,
	returnGoods,
	fiscalHistory,
	addItems,
	addLocations,
	addSuppliers,
	addUnits,
	addUser,
	createBusiness,
	day,
	document,
	money,
	serials,
	purchaseOrderSeed,
	receiveOrder,
	stockTake,
	type Business,
	type ItemSpec
} from './helpers';
import type { Tx } from '$lib/server/stock/post';

export const HARDWARE = 'Bole Hardware & Building Materials';

const ITEMS: ItemSpec[] = [
	// Cement goes off: it is lot-tracked with an expiry date, and warns a month ahead.
	{
		sku: 'CEM-OPC-50',
		name: 'OPC cement 42.5R, 50 kg',
		nameAm: 'ሲሚንቶ',
		category: 'Cement & aggregates',
		unit: 'Bag',
		price: 1450,
		reorder: 200,
		flags: { trackExpiry: true }
	},
	{
		sku: 'CEM-PPC-50',
		name: 'PPC cement 32.5, 50 kg',
		nameAm: 'ሲሚንቶ',
		category: 'Cement & aggregates',
		unit: 'Bag',
		price: 1300,
		reorder: 100,
		flags: { trackExpiry: true }
	},
	{
		sku: 'ADH-25',
		name: 'Tile adhesive, 25 kg',
		category: 'Cement & aggregates',
		unit: 'Bag',
		price: 850,
		flags: { trackExpiry: true }
	},
	{
		sku: 'SAND-F',
		name: 'Fine sand',
		nameAm: 'አሸዋ',
		category: 'Cement & aggregates',
		unit: 'Cubic metre',
		price: 2600,
		reorder: 10
	},
	{
		sku: 'RB-08',
		name: 'Deformed rebar Ø8 mm, 12 m',
		nameAm: 'ፌሮ',
		category: 'Steel & rebar',
		unit: 'Bar',
		packs: [['Bundle', 20]],
		price: 520,
		reorder: 100
	},
	{
		sku: 'RB-12',
		name: 'Deformed rebar Ø12 mm, 12 m',
		nameAm: 'ፌሮ',
		category: 'Steel & rebar',
		unit: 'Bar',
		packs: [['Bundle', 10]],
		price: 1150,
		reorder: 60
	},
	{
		sku: 'RB-16',
		name: 'Deformed rebar Ø16 mm, 12 m',
		nameAm: 'ፌሮ',
		category: 'Steel & rebar',
		unit: 'Bar',
		price: 2050,
		reorder: 40
	},
	{
		sku: 'CIS-G32',
		name: 'Corrugated iron sheet G-32, 3 m',
		nameAm: 'ቆርቆሮ',
		category: 'Roofing',
		unit: 'Sheet',
		packs: [['Bundle', 20]],
		price: 780,
		reorder: 100
	},
	{
		sku: 'NAIL-RF',
		name: 'Roofing nails with washer',
		nameAm: 'የቆርቆሮ ሚስማር',
		category: 'Fasteners',
		unit: 'Kilogram',
		price: 190
	},
	{
		sku: 'NAIL-10',
		name: 'Common nails 10 cm',
		nameAm: 'ሚስማር',
		category: 'Fasteners',
		unit: 'Kilogram',
		packs: [['Carton', 25]],
		price: 145,
		reorder: 50
	},
	{
		sku: 'PNT-EMW-4',
		name: 'Emulsion paint, white, 4 L',
		nameAm: 'ቀለም',
		category: 'Paint & finishes',
		unit: 'Gallon',
		packs: [['Carton', 4]],
		price: 1250,
		reorder: 10,
		flags: { trackExpiry: true }
	},
	{
		sku: 'PNT-OIL-BLK',
		name: 'Oil paint, black, 4 L',
		nameAm: 'ቀለም',
		category: 'Paint & finishes',
		unit: 'Gallon',
		price: 1450,
		flags: { trackExpiry: true }
	},
	{
		sku: 'PVC-050',
		name: 'PVC pipe ½″ × 6 m',
		nameAm: 'ቱቦ',
		category: 'Plumbing',
		unit: 'Piece',
		price: 240,
		reorder: 30
	},
	{
		sku: 'PPR-020',
		name: 'PPR pipe 20 mm × 4 m',
		category: 'Plumbing',
		unit: 'Piece',
		price: 310,
		reorder: 30
	},
	{
		sku: 'TANK-1000',
		name: 'Water tank 1000 L',
		nameAm: 'የውሃ ታንከር',
		category: 'Plumbing',
		unit: 'Piece',
		price: 9800,
		reorder: 5
	},
	{
		sku: 'CBL-1.5',
		name: 'Electric cable 1.5 mm², copper',
		nameAm: 'ሽቦ',
		category: 'Electrical',
		unit: 'Metre',
		packs: [['Roll', 100]],
		price: 42,
		reorder: 300
	},
	{
		sku: 'CBL-2.5',
		name: 'Electric cable 2.5 mm², copper',
		nameAm: 'ሽቦ',
		category: 'Electrical',
		unit: 'Metre',
		packs: [['Roll', 100]],
		price: 58,
		reorder: 500
	},
	{
		sku: 'SW-1G',
		name: 'Light switch, 1 gang',
		nameAm: 'ማብሪያ ማጥፊያ',
		category: 'Electrical',
		unit: 'Piece',
		packs: [['Box', 10]],
		price: 95,
		barcodes: ['6297000410013']
	},
	{
		sku: 'WB-65',
		name: 'Wheelbarrow 65 L',
		nameAm: 'ጋሪ',
		category: 'Hand tools',
		unit: 'Piece',
		price: 3900,
		reorder: 12
	},
	{
		sku: 'HMR-500',
		name: 'Claw hammer 500 g',
		nameAm: 'መዶሻ',
		category: 'Hand tools',
		unit: 'Piece',
		price: 650,
		reorder: 10,
		barcodes: ['6297000420012']
	},
	{
		sku: 'TAPE-5',
		name: 'Measuring tape 5 m',
		nameAm: 'ሜትር',
		category: 'Hand tools',
		unit: 'Piece',
		packs: [['Box', 12]],
		price: 280,
		barcodes: ['6297000430011']
	},
	// Rented to contractors, never sold; each machine by its serial number.
	{
		sku: 'MIX-350',
		name: 'Concrete mixer 350 L, diesel',
		nameAm: 'ሚክሰር',
		category: 'Equipment rental',
		unit: 'Piece',
		description: 'Rented by the day with an operator. Deposit and guarantor required.',
		flags: { trackSerials: true, leasable: true, sellable: false }
	},
	{
		sku: 'DEL-AA',
		name: 'Delivery within Addis Ababa (Isuzu truck)',
		category: 'Services',
		unit: 'Piece',
		price: 1500,
		flags: { stockTracked: false, purchasable: false }
	}
];

/** Where each item normally comes from. Services have none. */
const MAIN_SUPPLIER: Record<string, string | undefined> = {
	'CEM-OPC-50': 'Sheger Cement Factory',
	'CEM-PPC-50': 'Sheger Cement Factory',
	'ADH-25': 'Addis Tile Supply',
	'SAND-F': 'Akaki sand quarry',
	'RB-08': 'Awash Steel Trading',
	'RB-12': 'Awash Steel Trading',
	'RB-16': 'Awash Steel Trading',
	'CIS-G32': 'Entoto Roofing & Paints',
	'NAIL-RF': 'Entoto Roofing & Paints',
	'NAIL-10': 'Entoto Roofing & Paints',
	'PNT-EMW-4': 'Entoto Roofing & Paints',
	'PNT-OIL-BLK': 'Entoto Roofing & Paints',
	'PVC-050': 'Merkato Electric Wholesale',
	'PPR-020': 'Merkato Electric Wholesale',
	'TANK-1000': 'Merkato Electric Wholesale',
	'CBL-1.5': 'Merkato Electric Wholesale',
	'CBL-2.5': 'Merkato Electric Wholesale',
	'SW-1G': 'Merkato Electric Wholesale',
	'WB-65': 'Merkato Electric Wholesale',
	'HMR-500': 'Merkato Electric Wholesale',
	'TAPE-5': 'Merkato Electric Wholesale',
	'MIX-350': 'Addis Machinery Import'
};

export async function seedHardware(tx: Tx): Promise<Business> {
	const biz = await createBusiness(tx, {
		name: HARDWARE,
		tin: '0034567812',
		phone: '+251 11 661 2345',
		address: 'Bole, Addis Ababa',
		main: {
			name: 'Bole',
			code: 'BOL',
			address: 'Bole Road, Addis Ababa',
			phone: '+251 11 661 2345',
			store: 'Bole Warehouse'
		},
		// VAT-registered, and a withholding agent: it keeps back tax on large purchases.
		settings: { vatRegistered: true, withholdingAgent: true, einvoiceMode: 'sandbox' }
	});

	await addBranch(tx, biz, {
		name: 'Merkato',
		code: 'MRK',
		address: 'Merkato, Addis Ababa',
		phone: '+251 11 278 9012'
	});
	await addLocations(tx, biz, [
		{ branch: 'BOL', name: 'Bole Yard', kind: 'storage' },
		{ branch: 'BOL', name: 'Bole Shop Floor', kind: 'sales' },
		{ branch: 'MRK', name: 'Merkato Store', kind: 'storage' },
		{ branch: 'MRK', name: 'Merkato Shop', kind: 'sales' }
	]);
	await addUnits(tx, biz, [
		{ name: 'Bag', symbol: 'bag' },
		{ name: 'Bar', symbol: 'bar' },
		{ name: 'Bundle', symbol: 'bdl' },
		{ name: 'Sheet', symbol: 'sht' },
		{ name: 'Roll', symbol: 'roll' },
		{ name: 'Gallon', symbol: 'gal' },
		{ name: 'Cubic metre', symbol: 'm³' }
	]);
	await addCategories(tx, biz, [
		{ name: 'Cement & aggregates', nameAm: 'ሲሚንቶ እና አሸዋ', warn: 30 },
		{ name: 'Steel & rebar', nameAm: 'ብረት' },
		{ name: 'Roofing', nameAm: 'ጣሪያ' },
		{ name: 'Fasteners', nameAm: 'ሚስማር' },
		{ name: 'Paint & finishes', nameAm: 'ቀለም', warn: 90 },
		{ name: 'Plumbing', nameAm: 'የቧንቧ ዕቃዎች' },
		{ name: 'Electrical', nameAm: 'የኤሌክትሪክ ዕቃዎች' },
		{ name: 'Hand tools', nameAm: 'መሳሪያዎች' },
		{ name: 'Equipment rental', nameAm: 'የሚከራዩ ማሽኖች' },
		{ name: 'Services', nameAm: 'አገልግሎት' }
	]);

	await addUser(tx, biz, {
		key: 'owner',
		name: 'Dawit Bekele',
		email: 'dawit@hardware.example.com',
		role: 'Owner',
		branch: 'BOL'
	});
	await addUser(tx, biz, {
		key: 'manager',
		name: 'Meron Tadesse',
		email: 'meron@hardware.example.com',
		role: 'Manager',
		branch: 'BOL'
	});
	await addUser(tx, biz, {
		key: 'merkato',
		name: 'Yonas Alemu',
		email: 'yonas@hardware.example.com',
		role: 'Storekeeper',
		branch: 'MRK'
	});
	await addUser(tx, biz, {
		key: 'clerk',
		name: 'Selam Girma',
		email: 'selam@hardware.example.com',
		role: 'Clerk',
		branch: 'BOL'
	});

	await addSuppliers(
		tx,
		biz,
		[
			{
				name: 'Sheger Cement Factory',
				phone: '+251 11 551 2020',
				email: 'sales@shegercement.example.com',
				address: 'Sululta road, Oromia',
				tin: '0012003401',
				contactPerson: 'Ato Girma',
				vatRegistered: true
			},
			{
				name: 'Awash Steel Trading',
				phone: '+251 911 402 118',
				address: 'Kality, Addis Ababa',
				tin: '0012005566',
				vatRegistered: true
			},
			{
				name: 'Entoto Roofing & Paints',
				phone: '+251 11 278 3300',
				email: 'orders@entotopaints.example.com',
				address: 'Shiro Meda, Addis Ababa',
				tin: '0012007788',
				vatRegistered: true
			},
			{
				name: 'Merkato Electric Wholesale',
				phone: '+251 912 660 045',
				address: 'Merkato, Addis Ababa',
				contactPerson: 'W/ro Hirut',
				tin: '0045001122',
				vatRegistered: true
			},
			{ name: 'Akaki sand quarry', phone: '+251 913 220 781', address: 'Akaki Kality' },
			{
				name: 'Addis Machinery Import',
				phone: '+251 11 467 1919',
				email: 'info@addismachinery.example.com',
				address: 'Bole, Addis Ababa',
				tin: '0012004512',
				vatRegistered: true
			},
			{ name: 'Addis Tile Supply', phone: '+251 911 887 342', address: 'Gerji, Addis Ababa' }
		],
		biz.users.get('owner')!
	);

	// Regular buyers. Walk-in sales below name nobody, as they do in the shop.
	await addCustomers(
		tx,
		biz,
		[
			{
				name: 'Sisay Construction PLC',
				phone: '+251 911 305 552',
				tin: '0023456781',
				address: 'Summit, Addis Ababa',
				note: 'Contractor; pays by bank transfer',
				creditLimit: 600_000,
				creditDays: 30,
				// A PLC above the turnover threshold: keeps back 3% and hands over a withholding receipt.
				withholdsTax: true
			},
			{
				name: 'Genet Finishing Works',
				phone: '+251 912 774 019',
				creditLimit: 20_000,
				creditDays: 15
			},
			{
				name: 'Tsehay Real Estate',
				phone: '+251 11 667 3030',
				email: 'procurement@tsehay.example.com',
				tin: '0034120987',
				address: 'CMC, Addis Ababa',
				creditLimit: 1_000_000,
				creditDays: 60,
				withholdsTax: true
			},
			{
				name: 'Abebe Kebede',
				phone: '+251 911 882 450',
				note: 'Private villa, CMC',
				// Cash only: every sale is paid before it is posted.
				creditLimit: 0,
				creditDays: 0
			}
		],
		biz.users.get('owner')!
	);

	await addItems(
		tx,
		biz,
		ITEMS.map((i) => ({ ...i, supplier: MAIN_SUPPLIER[i.sku] })),
		biz.users.get('owner')!
	);

	const mixers = serials('MX350-23', 1, 3, 2);

	// ── Opening deliveries ──────────────────────────────────────────────────────────────────
	await document(
		tx,
		biz,
		{
			type: 'receipt',
			date: day(-80),
			to: 'Bole Warehouse',
			supplier: 'Addis Tile Supply',
			reference: 'ATS-118',
			by: 'manager'
		},
		[{ sku: 'ADH-25', qty: 40, cost: 610, lot: 'ADH-2602', expiry: day(-5) }]
	);
	const grnCement = await document(
		tx,
		biz,
		{
			type: 'receipt',
			date: day(-75),
			to: 'Bole Warehouse',
			supplier: 'Sheger Cement Factory',
			reference: 'SCF-2291',
			by: 'manager'
		},
		[
			{ sku: 'CEM-OPC-50', qty: 600, cost: 1180, lot: 'OPC-2607A', expiry: day(15) },
			{ sku: 'CEM-PPC-50', qty: 300, cost: 1050, lot: 'PPC-2607B', expiry: day(40) }
		]
	);
	const grnSteel = await document(
		tx,
		biz,
		{
			type: 'receipt',
			date: day(-70),
			to: 'Bole Yard',
			supplier: 'Awash Steel Trading',
			reference: 'AST-0417',
			by: 'manager'
		},
		[
			{ sku: 'RB-12', qty: 20, unit: 'Bundle', cost: 9800 },
			{ sku: 'RB-08', qty: 10, unit: 'Bundle', cost: 8400 },
			{ sku: 'RB-16', qty: 150, cost: 1780 }
		]
	);
	const grnRoofing = await document(
		tx,
		biz,
		{
			type: 'receipt',
			date: day(-68),
			to: 'Bole Warehouse',
			supplier: 'Entoto Roofing & Paints',
			reference: 'ERP-7730',
			by: 'manager'
		},
		[
			{ sku: 'CIS-G32', qty: 15, unit: 'Bundle', cost: 13200 },
			{ sku: 'PNT-EMW-4', qty: 10, unit: 'Carton', cost: 3920, lot: 'EMW-2405', expiry: day(300) },
			{ sku: 'PNT-OIL-BLK', qty: 24, cost: 1150, lot: 'OIL-2403', expiry: day(200) },
			{ sku: 'NAIL-10', qty: 8, unit: 'Carton', cost: 2900 },
			{ sku: 'NAIL-RF', qty: 60, cost: 150 }
		]
	);
	const grnElectric = await document(
		tx,
		biz,
		{
			type: 'receipt',
			date: day(-66),
			to: 'Bole Warehouse',
			supplier: 'Merkato Electric Wholesale',
			reference: 'MEW-3312',
			by: 'manager'
		},
		[
			{ sku: 'CBL-2.5', qty: 12, unit: 'Roll', cost: 4200 },
			{ sku: 'CBL-1.5', qty: 8, unit: 'Roll', cost: 3100 },
			{ sku: 'SW-1G', qty: 20, unit: 'Box', cost: 650 },
			{ sku: 'PVC-050', qty: 120, cost: 170 },
			{ sku: 'PPR-020', qty: 80, cost: 230 },
			{ sku: 'TANK-1000', qty: 6, cost: 7600 },
			{ sku: 'WB-65', qty: 15, cost: 2900 },
			{ sku: 'HMR-500', qty: 30, cost: 420 },
			{ sku: 'TAPE-5', qty: 5, unit: 'Box', cost: 2160 }
		]
	);
	const grnSand = await document(
		tx,
		biz,
		{
			type: 'receipt',
			date: day(-64),
			to: 'Bole Yard',
			supplier: 'Akaki sand quarry',
			reference: 'Truck plate 3-A12345',
			by: 'manager'
		},
		[{ sku: 'SAND-F', qty: 24, cost: 1900 }]
	);
	await document(
		tx,
		biz,
		{
			type: 'receipt',
			date: day(-64),
			to: 'Bole Yard',
			supplier: 'Addis Machinery Import',
			reference: 'AMI-0045',
			by: 'owner'
		},
		[{ sku: 'MIX-350', qty: 3, cost: 185000, serials: mixers }]
	);

	// ── Stocking the Merkato shop ───────────────────────────────────────────────────────────
	await document(
		tx,
		biz,
		{
			type: 'transfer',
			date: day(-60),
			from: 'Bole Warehouse',
			to: 'Merkato Store',
			party: 'Driver: Tesfaye, 3-B45678',
			by: 'manager'
		},
		[
			{ sku: 'CEM-OPC-50', qty: 150 },
			{ sku: 'CIS-G32', qty: 5, unit: 'Bundle' },
			{ sku: 'NAIL-10', qty: 2, unit: 'Carton' },
			{ sku: 'CBL-2.5', qty: 3, unit: 'Roll' },
			{ sku: 'PVC-050', qty: 40 },
			{ sku: 'TANK-1000', qty: 2 }
		]
	);
	await document(
		tx,
		biz,
		{ type: 'transfer', date: day(-58), from: 'Bole Yard', to: 'Merkato Store', by: 'manager' },
		[
			{ sku: 'RB-12', qty: 5, unit: 'Bundle' },
			{ sku: 'RB-08', qty: 3, unit: 'Bundle' }
		]
	);

	// ── Trading ─────────────────────────────────────────────────────────────────────────────
	const saleSisay1 = await document(
		tx,
		biz,
		{
			type: 'issue',
			date: day(-55),
			from: 'Bole Warehouse',
			customer: 'Sisay Construction PLC',
			reference: 'SO-1043',
			by: 'manager'
		},
		[
			{ sku: 'CEM-OPC-50', qty: 180 },
			{ sku: 'CEM-PPC-50', qty: 60 },
			{ sku: 'CIS-G32', qty: 3, unit: 'Bundle' },
			{ sku: 'NAIL-10', qty: 40 }
		]
	);
	const saleSisay2 = await document(
		tx,
		biz,
		{
			type: 'issue',
			date: day(-52),
			from: 'Bole Yard',
			customer: 'Sisay Construction PLC',
			reference: 'SO-1043',
			by: 'manager'
		},
		[
			{ sku: 'RB-12', qty: 6, unit: 'Bundle' },
			{ sku: 'RB-16', qty: 40 },
			{ sku: 'SAND-F', qty: 6.5 }
		]
	);
	const saleGenet = await document(
		tx,
		biz,
		{
			type: 'issue',
			date: day(-50),
			from: 'Bole Warehouse',
			customer: 'Genet Finishing Works',
			reference: 'SO-1051',
			by: 'manager'
		},
		[{ sku: 'ADH-25', qty: 30 }]
	);
	const saleMerkato1 = await document(
		tx,
		biz,
		{
			type: 'issue',
			date: day(-45),
			from: 'Merkato Store',
			reference: 'Daily sales book p.12–18',
			by: 'merkato'
		},
		[
			{ sku: 'CEM-OPC-50', qty: 45 },
			{ sku: 'NAIL-10', qty: 12.5 },
			{ sku: 'CBL-2.5', qty: 150 },
			{ sku: 'PVC-050', qty: 18 }
		]
	);
	// A second cement lot: the average cost moves, and FEFO keeps selling the older lot first.
	const grnCement2 = await document(
		tx,
		biz,
		{
			type: 'receipt',
			date: day(-40),
			to: 'Bole Warehouse',
			supplier: 'Sheger Cement Factory',
			reference: 'SCF-2350',
			by: 'manager'
		},
		[{ sku: 'CEM-OPC-50', qty: 400, cost: 1240, lot: 'OPC-2608C', expiry: day(55) }]
	);
	await document(
		tx,
		biz,
		{
			type: 'transfer',
			date: day(-35),
			from: 'Bole Yard',
			to: 'Merkato Store',
			note: 'Mixer for the Merkato rental customers',
			by: 'manager'
		},
		[{ sku: 'MIX-350', qty: 1, serials: [mixers[2]] }]
	);
	const saleTsehay = await document(
		tx,
		biz,
		{
			type: 'issue',
			date: day(-30),
			from: 'Bole Warehouse',
			customer: 'Tsehay Real Estate',
			party: 'Site 4, CMC',
			reference: 'SO-1088',
			by: 'manager'
		},
		[
			{ sku: 'CEM-OPC-50', qty: 250 },
			{ sku: 'PNT-EMW-4', qty: 12 },
			{ sku: 'PPR-020', qty: 30 },
			{ sku: 'TANK-1000', qty: 2 },
			{ sku: 'WB-65', qty: 4 }
		]
	);
	await document(
		tx,
		biz,
		{
			type: 'adjustment',
			date: day(-21),
			from: 'Bole Warehouse',
			reason: 'damage',
			note: 'Bags torn by rain while unloading',
			by: 'manager'
		},
		[{ sku: 'CEM-OPC-50', qty: -8, fromLot: 'OPC-2608C' }]
	);
	await document(
		tx,
		biz,
		{
			type: 'adjustment',
			date: day(-14),
			from: 'Merkato Store',
			reason: 'count',
			note: 'Monthly stock count',
			by: 'manager'
		},
		[
			{ sku: 'NAIL-10', qty: -1.5 },
			{ sku: 'CBL-2.5', qty: 20 }
		]
	);
	const saleMerkato2 = await document(
		tx,
		biz,
		{
			type: 'issue',
			date: day(-10),
			from: 'Merkato Store',
			reference: 'Daily sales book p.31–36',
			by: 'merkato'
		},
		[{ sku: 'CEM-OPC-50', qty: 60 }]
	);
	const saleVilla = await document(
		tx,
		biz,
		{
			type: 'issue',
			date: day(-5),
			from: 'Bole Yard',
			customer: 'Abebe Kebede',
			reference: 'SO-1102',
			by: 'manager'
		},
		[
			{ sku: 'RB-16', qty: 20 },
			{ sku: 'RB-12', qty: 2, unit: 'Bundle' }
		]
	);
	// Expired adhesive pulled off the shelf, waiting for a decision.
	await document(
		tx,
		biz,
		{
			type: 'transfer',
			date: day(-3),
			from: 'Bole Warehouse',
			to: 'Quarantine',
			note: 'Expired — return to supplier or write off',
			by: 'manager'
		},
		[{ sku: 'ADH-25', qty: 10, fromLot: 'ADH-2602' }]
	);
	const saleWalkIn = await document(
		tx,
		biz,
		{
			type: 'issue',
			date: day(-2),
			from: 'Bole Warehouse',
			by: 'manager'
		},
		[
			{ sku: 'TAPE-5', qty: 6 },
			{ sku: 'HMR-500', qty: 5 },
			{ sku: 'SW-1G', qty: 3, unit: 'Box' },
			{ sku: 'CBL-1.5', qty: 2, unit: 'Roll' }
		]
	);

	// ── Waiting to be posted ────────────────────────────────────────────────────────────────
	await document(
		tx,
		biz,
		{
			type: 'receipt',
			date: day(-1),
			to: 'Bole Warehouse',
			supplier: 'Sheger Cement Factory',
			reference: 'SCF-2411',
			note: 'Truck arrived, count before posting',
			by: 'clerk',
			draft: true
		},
		[{ sku: 'CEM-OPC-50', qty: 500, cost: 1260, lot: 'OPC-2609D', expiry: day(85) }]
	);
	await document(
		tx,
		biz,
		{
			type: 'transfer',
			date: day(0),
			from: 'Bole Warehouse',
			to: 'Merkato Shop',
			by: 'clerk',
			draft: true
		},
		[{ sku: 'CEM-PPC-50', qty: 50 }]
	);

	// ── Money ───────────────────────────────────────────────────────────────────────────────
	// Suppliers paid, customers paying, and the running costs of the business. Meron records,
	// Dawit verifies against the bank and Telebirr statements.
	await money(tx, biz, {
		direction: 'out',
		settle: true,
		date: day(-75),
		method: 'Bank transfer — CBE',
		purpose: 'purchase',
		party: 'Sheger Cement Factory',
		reference: 'FT25196K8LQ2',
		receipt: 'SCF-2291',
		branch: 'BOL',
		by: 'manager',
		verifiedBy: 'owner',
		attach: 'CBE transfer confirmation',
		documents: [grnCement]
	});
	await money(tx, biz, {
		direction: 'out',
		amount: 2_400,
		date: day(-75),
		method: 'Cash',
		purpose: 'expense',
		party: 'Loaders — Sheger truck',
		description: 'Unloading 900 bags',
		branch: 'BOL',
		by: 'manager'
	});
	await money(tx, biz, {
		direction: 'out',
		settle: true,
		date: day(-70),
		method: 'Bank transfer — other bank',
		purpose: 'purchase',
		party: 'Awash Steel Trading',
		reference: 'AWB-TRF-0417-771',
		receipt: 'AST-0417',
		branch: 'BOL',
		by: 'manager',
		documents: [grnSteel]
	});
	await money(tx, biz, {
		direction: 'out',
		settle: true,
		date: day(-68),
		method: 'Cheque',
		purpose: 'purchase',
		party: 'Entoto Roofing & Paints',
		reference: 'CHQ 00451283',
		receipt: 'ERP-7730',
		branch: 'BOL',
		by: 'manager',
		verifiedBy: 'owner',
		documents: [grnRoofing]
	});
	await money(tx, biz, {
		direction: 'out',
		settle: true,
		date: day(-66),
		method: 'Telebirr',
		purpose: 'purchase',
		party: 'Merkato Electric Wholesale',
		reference: 'CI78K2P9QX',
		receipt: 'MEW-3312',
		branch: 'BOL',
		by: 'manager',
		verifiedBy: 'owner',
		attach: 'Telebirr payment screenshot',
		documents: [grnElectric]
	});
	await money(tx, biz, {
		direction: 'out',
		settle: true,
		date: day(-64),
		method: 'Cash',
		purpose: 'purchase',
		party: 'Akaki sand quarry',
		receipt: 'Truck plate 3-A12345',
		branch: 'BOL',
		by: 'manager',
		documents: [grnSand]
	});
	await money(tx, biz, {
		direction: 'out',
		amount: 45_000,
		date: day(-60),
		method: 'Bank transfer — CBE',
		purpose: 'expense',
		party: 'Tadesse Kebede (landlord)',
		reference: 'FT25201RENT09',
		description: 'Bole warehouse and yard rent, Meskerem',
		branch: 'BOL',
		by: 'owner',
		verifiedBy: 'manager',
		attach: 'Rent receipt'
	});
	// One transfer for two deliveries to the same site.
	await money(tx, biz, {
		direction: 'in',
		settle: true,
		date: day(-52),
		method: 'Bank transfer — CBE',
		purpose: 'sale',
		party: 'Sisay Construction PLC',
		customer: 'Sisay Construction PLC',
		reference: 'FT25202SSC1043',
		receipt: 'FS-00118',
		branch: 'BOL',
		by: 'manager',
		verifiedBy: 'owner',
		attach: 'Incoming transfer advice',
		documents: [saleSisay1, saleSisay2]
	});
	await money(tx, biz, {
		direction: 'in',
		settle: true,
		date: day(-50),
		method: 'CBE Birr',
		purpose: 'sale',
		party: 'Genet Finishing Works',
		customer: 'Genet Finishing Works',
		reference: 'CB0098812',
		receipt: 'FS-00121',
		branch: 'BOL',
		by: 'manager',
		verifiedBy: 'owner',
		documents: [saleGenet]
	});
	await money(tx, biz, {
		direction: 'in',
		amount: 80_082.5,
		date: day(-45),
		method: 'Cash',
		purpose: 'sale',
		party: 'Walk-in customers',
		receipt: 'Sales book p.12–18',
		branch: 'MRK',
		by: 'merkato',
		verifiedBy: 'manager',
		documents: [saleMerkato1]
	});
	// Typed in twice by mistake; the second one is voided and stops counting.
	await money(tx, biz, {
		direction: 'in',
		amount: 80_082.5,
		date: day(-45),
		method: 'Cash',
		purpose: 'sale',
		party: 'Walk-in customers',
		receipt: 'Sales book p.12–18',
		branch: 'MRK',
		by: 'merkato',
		void: 'Entered twice — same sales book pages'
	});
	await money(tx, biz, {
		direction: 'out',
		settle: true,
		date: day(-40),
		method: 'Bank transfer — CBE',
		purpose: 'purchase',
		party: 'Sheger Cement Factory',
		reference: 'FT25214M8C2350',
		receipt: 'SCF-2350',
		branch: 'BOL',
		by: 'manager',
		verifiedBy: 'owner',
		documents: [grnCement2]
	});
	await money(tx, biz, {
		direction: 'out',
		amount: 3_850,
		date: day(-40),
		method: 'Telebirr',
		purpose: 'expense',
		party: 'Ethiopian Electric Utility',
		reference: 'CI2EEU7741',
		description: 'Bole warehouse electricity',
		branch: 'BOL',
		by: 'manager',
		verifiedBy: 'owner'
	});
	await money(tx, biz, {
		direction: 'in',
		settle: true,
		date: day(-30),
		method: 'Bank transfer — CBE',
		purpose: 'sale',
		party: 'Tsehay Real Estate — Site 4',
		customer: 'Tsehay Real Estate',
		reference: 'FT25227TRE088',
		receipt: 'FS-00140',
		branch: 'BOL',
		by: 'manager',
		attach: 'Transfer screenshot from customer',
		documents: [saleTsehay]
	});
	await money(tx, biz, {
		direction: 'in',
		amount: 1_500,
		date: day(-30),
		method: 'Cash',
		purpose: 'sale',
		party: 'Tsehay Real Estate — Site 4',
		description: 'Delivery to site (Isuzu)',
		// A service, not goods on their account: no customer, so it does not count against them.
		branch: 'BOL',
		by: 'manager',
		verifiedBy: 'owner'
	});
	await money(tx, biz, {
		direction: 'in',
		settle: true,
		date: day(-10),
		method: 'Cash',
		purpose: 'sale',
		party: 'Walk-in customers',
		receipt: 'Sales book p.31–36',
		branch: 'MRK',
		by: 'merkato',
		documents: [saleMerkato2]
	});
	await money(tx, biz, {
		direction: 'in',
		settle: true,
		date: day(-5),
		method: 'Telebirr',
		purpose: 'sale',
		party: 'Abebe Kebede (private villa, CMC)',
		customer: 'Abebe Kebede',
		reference: 'CI9F3K1LMN',
		receipt: 'FS-00152',
		branch: 'BOL',
		by: 'manager',
		attach: 'Telebirr screenshot from customer',
		documents: [saleVilla]
	});
	await money(tx, biz, {
		direction: 'in',
		settle: true,
		date: day(-2),
		method: 'Cash',
		purpose: 'sale',
		party: 'Walk-in customers',
		branch: 'BOL',
		by: 'manager',
		documents: [saleWalkIn]
	});

	// ── Purchase orders ───────────────────────────────────────────────────────────────────────
	// Delivered in full.
	const poCement = await purchaseOrderSeed(
		tx,
		biz,
		{
			supplier: 'Sheger Cement Factory',
			deliverTo: 'Bole Warehouse',
			date: day(-12),
			expected: day(-7),
			reference: 'Proforma SCF-PF-0912',
			by: 'manager'
		},
		[{ sku: 'CEM-OPC-50', qty: 300, price: 1260 }]
	);
	await receiveOrder(
		tx,
		biz,
		poCement,
		{ date: day(-7), by: 'manager', reference: 'SCF-DN-2471' },
		{ 'CEM-OPC-50': { lot: 'OPC-2609D', expiry: day(85) } }
	);

	// Part of it came; the switches and the pipe are still due.
	const poElectric = await purchaseOrderSeed(
		tx,
		biz,
		{
			supplier: 'Merkato Electric Wholesale',
			deliverTo: 'Bole Warehouse',
			date: day(-9),
			expected: day(-4),
			by: 'manager'
		},
		[
			{ sku: 'CBL-2.5', qty: 10, unit: 'Roll', price: 4200 },
			{ sku: 'SW-1G', qty: 10, unit: 'Box', price: 650 },
			{ sku: 'PVC-050', qty: 100, price: 170 }
		]
	);
	await receiveOrder(
		tx,
		biz,
		poElectric,
		{ date: day(-4), by: 'manager', reference: 'MEW-3390' },
		{ 'CBL-2.5': { qty: 6 }, 'SW-1G': { qty: 4 }, 'PVC-050': { qty: 0 } }
	);

	// Placed, nothing arrived yet.
	await purchaseOrderSeed(
		tx,
		biz,
		{
			supplier: 'Awash Steel Trading',
			deliverTo: 'Bole Yard',
			date: day(-3),
			expected: day(4),
			note: 'Deliver before noon; the yard gate closes for lunch.',
			by: 'owner'
		},
		[
			{ sku: 'RB-12', qty: 10, unit: 'Bundle', price: 9800 },
			{ sku: 'RB-16', qty: 100, price: 1780 }
		]
	);

	// Still being put together.
	await purchaseOrderSeed(
		tx,
		biz,
		{
			supplier: 'Entoto Roofing & Paints',
			deliverTo: 'Bole Warehouse',
			date: day(0),
			by: 'manager',
			draft: true
		},
		[
			{ sku: 'CIS-G32', qty: 5, unit: 'Bundle', price: 13200 },
			{ sku: 'PNT-EMW-4', qty: 20, price: 1000 }
		]
	);

	// ── Stock count ───────────────────────────────────────────────────────────────────────────
	// Merkato's monthly count: two lengths of pipe and half a kilo of nails missing.
	await stockTake(
		tx,
		biz,
		{ location: 'Merkato Store', date: day(-1), by: 'merkato', note: 'Monthly count' },
		[
			{ sku: 'PVC-050', delta: -2 },
			{ sku: 'NAIL-10', delta: -0.5 }
		]
	);

	// ── Credit (ዱቤ) ──────────────────────────────────────────────────────────────────────────
	// Sisay took cement for another site on 30 days' credit and has paid part: the rest is late.
	await document(
		tx,
		biz,
		{
			type: 'issue',
			date: day(-45),
			from: 'Bole Warehouse',
			customer: 'Sisay Construction PLC',
			party: 'Site 3, Summit',
			reference: 'Delivery note DN-0419',
			by: 'manager'
		},
		[{ sku: 'CEM-OPC-50', qty: 60 }]
	);
	await money(tx, biz, {
		direction: 'in',
		amount: 40_000,
		date: day(-10),
		method: 'Telebirr',
		purpose: 'sale',
		party: 'Sisay Construction PLC',
		customer: 'Sisay Construction PLC',
		reference: 'CI7SSC40K01',
		description: 'Part payment for DN-0419',
		branch: 'BOL',
		by: 'manager'
	});

	// Genet took paint worth more than the 20,000 limit, with the owner's say-so. Not yet due.
	const creditGenet = await document(
		tx,
		biz,
		{
			type: 'issue',
			date: day(-6),
			from: 'Bole Warehouse',
			customer: 'Genet Finishing Works',
			reference: 'Approved by Dawit over limit',
			by: 'owner'
		},
		[{ sku: 'PNT-EMW-4', qty: 20 }]
	);

	// ── Returns ──────────────────────────────────────────────────────────────────────────────
	// Genet brought back four gallons of the paint: the wrong shade. Off their account.
	await returnGoods(
		tx,
		biz,
		{ of: creditGenet, date: day(-2), by: 'manager', note: 'Wrong shade; unopened' },
		{ 'PNT-EMW-4': 4 }
	);

	// ── Fiscal receipts and e-invoices ───────────────────────────────────────────────────────
	// Bole's till is rung up by hand and its FS No. typed back in; Merkato has a networked Datecs
	// printer (no real one here, so "Check" on it shows what a failed connection looks like).
	await fiscalHistory(tx, biz, [
		{
			name: 'Bole till',
			kind: 'manual',
			branch: 'BOL',
			machineCode: 'BHB0023145',
			autoPrint: true,
			isActive: true
		},
		{
			name: 'Merkato fiscal printer',
			kind: 'datecs_tcp',
			branch: 'MRK',
			machineCode: 'BHB0023146',
			serialNumber: 'DT780126',
			host: '192.168.10.20',
			port: 4999,
			operatorCode: '1',
			tillNumber: 1,
			taxGroups: '15=A,0=B,exempt=C',
			autoPrint: false,
			isActive: true
		}
	]);

	return biz;
}
